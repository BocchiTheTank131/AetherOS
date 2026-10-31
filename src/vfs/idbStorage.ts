// AetherOS - IndexedDB Storage Engine for Virtual Filesystem
import type { VFSNode } from './types';
import { systemLogger } from '../core/logger';

const DB_NAME = 'AetherOS_DB';
const DB_VERSION = 1;
const STORE_NAME = 'vfs_nodes';

export class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private isAvailable = false;
  private pendingSaves = new Map<string, VFSNode>();
  private pendingDeletes = new Set<string>();
  private saveTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    this.isAvailable = typeof indexedDB !== 'undefined';
  }

  public async init(): Promise<boolean> {
    if (!this.isAvailable) {
      systemLogger.warn('vfs', 'IndexedDB is not supported in this environment. Falling back to memory storage.');
      return false;
    }

    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'path' });
          }
        };

        req.onsuccess = () => {
          this.db = req.result;
          systemLogger.info('vfs', 'IndexedDB persistent storage connected');
          resolve(true);
        };

        req.onerror = () => {
          systemLogger.warn('vfs', `Failed to open IndexedDB: ${req.error?.message}`);
          resolve(false);
        };
      } catch (err) {
        systemLogger.warn('vfs', `IndexedDB open exception: ${String(err)}`);
        resolve(false);
      }
    });
  }

  public async loadAll(): Promise<Map<string, VFSNode>> {
    const nodes = new Map<string, VFSNode>();
    if (!this.db) return nodes;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const list: VFSNode[] = req.result || [];
          for (const item of list) {
            nodes.set(item.path, item);
          }
          systemLogger.info('vfs', `Loaded ${nodes.size} nodes from persistent storage`);
          resolve(nodes);
        };

        req.onerror = () => {
          systemLogger.error('vfs', `Failed to load nodes: ${req.error?.message}`);
          resolve(nodes);
        };
      } catch (err) {
        systemLogger.error('vfs', `Transaction error loading nodes: ${String(err)}`);
        resolve(nodes);
      }
    });
  }

  public queueSave(node: VFSNode): void {
    this.pendingDeletes.delete(node.path);
    this.pendingSaves.set(node.path, node);
    this.scheduleFlush();
  }

  public queueDelete(path: string): void {
    this.pendingSaves.delete(path);
    this.pendingDeletes.add(path);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.flush();
    }, 400);
  }

  public async flush(): Promise<void> {
    if (!this.db || (this.pendingSaves.size === 0 && this.pendingDeletes.size === 0)) {
      return;
    }

    const toSave = Array.from(this.pendingSaves.values());
    const toDelete = Array.from(this.pendingDeletes.values());

    this.pendingSaves.clear();
    this.pendingDeletes.clear();

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        for (const node of toSave) {
          // Never persist dynamic virtual nodes like /proc or /dev
          if (!node.path.startsWith('/proc') && !node.path.startsWith('/dev')) {
            store.put(node);
          }
        }

        for (const path of toDelete) {
          store.delete(path);
        }

        tx.oncomplete = () => {
          resolve();
        };

        tx.onerror = () => {
          systemLogger.error('vfs', `Error writing to IndexedDB: ${tx.error?.message}`);
          resolve();
        };
      } catch (err) {
        systemLogger.error('vfs', `Flush exception: ${String(err)}`);
        resolve();
      }
    });
  }

  public async clearAll(): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => {
          systemLogger.info('vfs', 'IndexedDB VFS storage wiped');
          resolve();
        };
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export const idbStorage = new IndexedDBStorage();
