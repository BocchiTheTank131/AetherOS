// AetherOS - Isolated Application-Private Storage Manager
import { vfs } from '../vfs/vfs';
import { systemLogger } from '../core/logger';

const BASE_STORAGE_DIR = '/home/aether/.local/share/aether/apps';
const DEFAULT_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024; // 5 MB

export class AppStorage {
  private ensureAppDir(appId: string): string {
    this.validateAppId(appId);
    const dir = `${BASE_STORAGE_DIR}/${appId}`;
    if (!vfs.exists(dir)) {
      vfs.mkdir(dir, { recursive: true });
    }
    return dir;
  }

  public validateAppId(appId: string): void {
    if (!appId || typeof appId !== 'string') {
      throw new Error('Invalid application identifier');
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(appId) || appId.includes('..')) {
      throw new Error(`Malicious or invalid appId rejected: ${appId}`);
    }
  }

  private getStorageFilePath(appId: string): string {
    const dir = this.ensureAppDir(appId);
    return `${dir}/storage.json`;
  }

  private loadStore(appId: string): Record<string, unknown> {
    const filePath = this.getStorageFilePath(appId);
    if (!vfs.exists(filePath)) {
      return {};
    }
    try {
      const raw = vfs.readFile(filePath);
      return JSON.parse(raw);
    } catch (err) {
      systemLogger.warn('storage', `Corrupted storage for ${appId}, resetting: ${String(err)}`);
      return {};
    }
  }

  private saveStore(appId: string, store: Record<string, unknown>): void {
    const filePath = this.getStorageFilePath(appId);
    const serialized = JSON.stringify(store, null, 2);

    if (serialized.length > DEFAULT_STORAGE_QUOTA_BYTES) {
      throw new Error(`Application storage quota exceeded (${DEFAULT_STORAGE_QUOTA_BYTES} bytes limit)`);
    }

    vfs.writeFile(filePath, serialized);
  }

  public async get(appId: string, key: string): Promise<unknown> {
    this.validateAppId(appId);
    const store = this.loadStore(appId);
    return store[key];
  }

  public async set(appId: string, key: string, value: unknown): Promise<void> {
    this.validateAppId(appId);
    if (typeof key !== 'string' || !key) {
      throw new Error('Storage key must be a non-empty string');
    }
    const store = this.loadStore(appId);
    store[key] = value;
    this.saveStore(appId, store);
  }

  public async delete(appId: string, key: string): Promise<boolean> {
    this.validateAppId(appId);
    const store = this.loadStore(appId);
    if (!(key in store)) return false;
    delete store[key];
    this.saveStore(appId, store);
    return true;
  }

  public async list(appId: string): Promise<string[]> {
    this.validateAppId(appId);
    const store = this.loadStore(appId);
    return Object.keys(store);
  }

  public async clear(appId: string): Promise<void> {
    this.validateAppId(appId);
    this.saveStore(appId, {});
  }

  public getUsage(appId: string): { bytes: number; keyCount: number } {
    try {
      this.validateAppId(appId);
      const filePath = this.getStorageFilePath(appId);
      if (!vfs.exists(filePath)) {
        return { bytes: 0, keyCount: 0 };
      }
      const raw = vfs.readFile(filePath);
      const store = JSON.parse(raw);
      return {
        bytes: raw.length,
        keyCount: Object.keys(store).length,
      };
    } catch {
      return { bytes: 0, keyCount: 0 };
    }
  }

  public purgeAppData(appId: string): void {
    this.validateAppId(appId);
    const dir = `${BASE_STORAGE_DIR}/${appId}`;
    if (vfs.exists(dir)) {
      try {
        vfs.rmdir(dir, { recursive: true });
        systemLogger.info('storage', `Purged private storage for app ${appId}`);
      } catch (err) {
        systemLogger.warn('storage', `Failed to purge storage for ${appId}: ${String(err)}`);
      }
    }
  }
}

export const appStorage = new AppStorage();
