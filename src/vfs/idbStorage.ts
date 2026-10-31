// AetherOS - IndexedDB Storage Engine for Virtual Filesystem (AetherFS 2.0)
import type { VFSNode } from './types';
import { systemLogger } from '../core/logger';

const DB_NAME = 'AetherOS_DB';
const DB_VERSION = 2;
const STORE_NAME = 'vfs_nodes';

export class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private isAvailable = false;
  private pendingSaves = new Map<string, VFSNode>();
  private pendingDeletes = new Set<string>();
  private saveTimeout?: ReturnType<typeof setTimeout>;
  private status: 'idle' | 'saving' | 'error' = 'idle';

  constructor() {
    this.isAvailable = typeof indexedDB !== 'undefined';
  }

  public getPersistenceStatus(): 'idle' | 'saving' | 'error' {
    return this.status;
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
          systemLogger.info('vfs', `Upgraded IndexedDB schema to version ${DB_VERSION}`);
        };

        req.onsuccess = () => {
          this.db = req.result;
          systemLogger.info('vfs', 'IndexedDB AetherFS 2.0 persistent storage connected');

          if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
              this.flush();
            });
            window.addEventListener('pagehide', () => {
              this.flush();
            });
          }

          resolve(true);
        };

        req.onerror = () => {
          this.status = 'error';
          systemLogger.warn('vfs', `Failed to open IndexedDB: ${req.error?.message}`);
          resolve(false);
        };
      } catch (err) {
        this.status = 'error';
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
            // Restore and normalize binary data
            if (item.binaryContent) {
              if (!(item.binaryContent instanceof Uint8Array)) {
                item.binaryContent = new Uint8Array(item.binaryContent);
              }
              item.size = item.binaryContent.byteLength;
            } else if (item.isBinary && item.content && item.content.startsWith('data:')) {
              // Backward compatibility migration for v1 data: URL base64 storage
              try {
                const base64Data = item.content.split(',')[1] || '';
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                item.binaryContent = bytes;
                item.size = bytes.byteLength;
              } catch {
                // Fallback to text length if decoding fails
                item.size = item.content.length;
              }
            }
            nodes.set(item.path, item);
          }
          systemLogger.info('vfs', `Loaded ${nodes.size} nodes from persistent storage`);
          resolve(nodes);
        };

        req.onerror = () => {
          this.status = 'error';
          systemLogger.error('vfs', `Failed to load nodes: ${req.error?.message}`);
          resolve(nodes);
        };
      } catch (err) {
        this.status = 'error';
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

  public async flush(): Promise<boolean> {
    if (!this.db || (this.pendingSaves.size === 0 && this.pendingDeletes.size === 0)) {
      return true;
    }

    const toSave = Array.from(this.pendingSaves.entries());
    const toDelete = Array.from(this.pendingDeletes);
    this.status = 'saving';

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        for (const [, node] of toSave) {
          // Never persist dynamic virtual nodes like /proc or /dev
          if (!node.path.startsWith('/proc') && !node.path.startsWith('/dev')) {
            store.put(node);
          }
        }

        for (const path of toDelete) {
          store.delete(path);
        }

        tx.oncomplete = () => {
          // Only remove committed items if they were not updated in memory while saving
          for (const [path, node] of toSave) {
            if (this.pendingSaves.get(path) === node) {
              this.pendingSaves.delete(path);
            }
          }
          for (const path of toDelete) {
            this.pendingDeletes.delete(path);
          }
          this.status = 'idle';
          resolve(true);
        };

        tx.onerror = () => {
          this.status = 'error';
          systemLogger.error('vfs', `Error writing to IndexedDB: ${tx.error?.message}`);
          resolve(false);
        };
      } catch (err) {
        this.status = 'error';
        systemLogger.error('vfs', `Flush exception: ${String(err)}`);
        resolve(false);
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
          this.pendingSaves.clear();
          this.pendingDeletes.clear();
          this.status = 'idle';
          systemLogger.info('vfs', 'IndexedDB VFS storage wiped');
          resolve();
        };
        tx.onerror = () => {
          this.status = 'error';
          resolve();
        };
      } catch {
        this.status = 'error';
        resolve();
      }
    });
  }
}

export const idbStorage = new IndexedDBStorage();
