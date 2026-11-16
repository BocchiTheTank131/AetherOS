import type { VFSNode } from './types';
import { systemLogger } from '../core/logger';

const DB_NAME = 'AetherOS_DB';
const STORE_NAME = 'vfs_nodes';
const META_STORE = 'vfs_meta';

export type PersistenceStatus = 'idle' | 'pending' | 'saving' | 'error' | 'unavailable' | 'conflict';

export function isStoredNode(node: VFSNode): boolean {
  if (!node || typeof node.path !== 'string' || !node.path.startsWith('/') ||
      node.path.includes('\\') || node.path.split('').some((char) => char.charCodeAt(0) < 32) || node.path.includes('//') ||
      node.path.split('/').some((part) => part === '.' || part === '..')) return false;
  if (node.path === '/') return node.type === 'dir';
  const slash = node.path.lastIndexOf('/');
  return node.name === node.path.slice(slash + 1) && node.name.length > 0 &&
    node.parentPath === (node.path.slice(0, slash) || '/') &&
    (node.type === 'dir' || node.type === 'file' || (node.type === 'symlink' && typeof node.targetPath === 'string')) &&
    Number.isFinite(node.size) && node.size >= 0 && Number.isInteger(node.permissions) &&
    typeof node.owner === 'string' && typeof node.group === 'string' &&
    (node.content === undefined || typeof node.content === 'string') &&
    (node.binaryContent === undefined || node.binaryContent instanceof Uint8Array);
}

export class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private opening?: Promise<boolean>;
  private revision = 0;
  private pending = new Map<string, { node?: VFSNode }>();
  private saveTimeout?: ReturnType<typeof setTimeout>;
  private writing?: Promise<boolean>;
  private status: PersistenceStatus = 'idle';
  private listeners = new Set<(status: PersistenceStatus) => void>();

  public getPersistenceStatus(): PersistenceStatus {
    return this.status;
  }

  public subscribe(listener: (status: PersistenceStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: PersistenceStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  public init(): Promise<boolean> {
    return this.opening ??= this.open();
  }

  private async open(): Promise<boolean> {
    if (typeof indexedDB === 'undefined') {
      this.setStatus('unavailable');
      return false;
    }
    return new Promise<boolean>((resolve) => {
      const req = indexedDB.open(DB_NAME, 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'path' });
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      };
      req.onsuccess = () => {
        this.db = req.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.setStatus('conflict');
        };
        resolve(true);
      };
      req.onerror = req.onblocked = () => {
        this.setStatus('unavailable');
        systemLogger.warn('vfs', 'IndexedDB could not open. Close older AetherOS tabs and reload.');
        resolve(false);
      };
    }).catch((error: unknown) => {
      this.setStatus('unavailable');
      systemLogger.warn('vfs', 'IndexedDB could not open: ' + String(error));
      return false;
    });
  }

  public async loadAll(): Promise<Map<string, VFSNode>> {
    if (!this.db) return new Map();
    try {
      const db = this.db;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME, META_STORE], 'readonly');
        const records = tx.objectStore(STORE_NAME).openCursor();
        const revision = tx.objectStore(META_STORE).get('revision');
        const nodes = new Map<string, VFSNode>();
        records.onsuccess = () => {
          const cursor = records.result;
          if (!cursor) return;
          const node = cursor.value as VFSNode;
          if (isStoredNode(node)) {
            if (node.binaryContent) node.size = node.binaryContent.length;
            nodes.set(node.path, node);
          } else {
            systemLogger.warn('vfs', 'Skipped invalid IndexedDB record ' + String(cursor.key));
          }
          cursor.continue();
        };
        tx.oncomplete = () => {
          this.revision = revision.result ?? 0;
          resolve(nodes);
        };
        tx.onabort = () => reject(tx.error);
      });
    } catch (error) {
      this.db?.close();
      this.db = null;
      this.setStatus('error');
      throw error;
    }
  }

  public queueSave(node: VFSNode): void {
    this.pending.set(node.path, { node });
    this.scheduleFlush();
  }

  public queueDelete(path: string): void {
    this.pending.set(path, {});
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (!this.db || this.status === 'conflict' || this.saveTimeout !== undefined) return;
    if (this.status === 'idle') this.setStatus('pending');
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = undefined;
      void this.flush();
    }, 25);
  }

  public flush(): Promise<boolean> {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = undefined;
    if (!this.db || this.status === 'conflict') return Promise.resolve(false);
    if (!this.writing) {
      const write = this.drain();
      this.writing = write.finally(() => { this.writing = undefined; });
    }
    return this.writing;
  }

  private async drain(): Promise<boolean> {
    while (this.pending.size) {
      const batch = new Map(this.pending);
      if (!await this.commit((store) => {
        for (const [path, op] of batch) {
          if (op.node) store.put(op.node);
          else store.delete(path);
        }
      })) return false;

      for (const [path, op] of batch) {
        if (this.pending.get(path) === op) this.pending.delete(path);
      }
    }
    this.setStatus('idle');
    return true;
  }

  public async replaceAll(nodes: Iterable<VFSNode>): Promise<boolean> {
    if (!this.db) return this.status === 'unavailable';
    if (!await this.flush() || this.writing) return false;
    const write = this.commit((store) => {
      store.clear();
      for (const node of nodes) store.put(node);
    });
    this.writing = write.then(async (success) => success && await this.drain())
      .finally(() => { this.writing = undefined; });
    return write;
  }

  private async commit(apply: (store: IDBObjectStore) => void): Promise<boolean> {
    const db = this.db;
    if (!db || this.status === 'conflict') return false;
    this.setStatus('saving');
    try {
      return await new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite', { durability: 'strict' });
        const meta = tx.objectStore(META_STORE);
        const req = meta.get('revision');
        req.onsuccess = () => {
          if ((req.result ?? 0) !== this.revision) {
            this.setStatus('conflict');
            tx.abort();
            return;
          }
          try {
            apply(tx.objectStore(STORE_NAME));
            meta.put(this.revision + 1, 'revision');
          } catch (error) {
            systemLogger.error('vfs', 'Could not queue IndexedDB transaction: ' + String(error));
            tx.abort();
          }
        };
        tx.oncomplete = () => {
          this.revision++;
          resolve(true);
        };
        tx.onabort = () => {
          if (this.status !== 'conflict') this.setStatus('error');
          const message = this.status === 'conflict' ? 'another tab wrote to storage' : tx.error?.message ?? 'transaction aborted';
          systemLogger.error('vfs', 'VFS persistence failed: ' + message);
          resolve(false);
        };
      });
    } catch (error) {
      this.setStatus('error');
      systemLogger.error('vfs', 'Failed to begin IndexedDB transaction: ' + String(error));
      return false;
    }
  }
}

export const idbStorage = new IndexedDBStorage();
