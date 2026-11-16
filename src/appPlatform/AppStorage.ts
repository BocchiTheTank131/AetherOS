// AetherOS - Isolated Application-Private Storage Manager
import { vfs } from '../vfs/vfs';
import { hasControlCharacters, isWithin, withoutSymlinks } from '../vfs/safePath';
import { systemLogger } from '../core/logger';

export const BASE_STORAGE_DIR = '/home/aether/.local/share/aether/apps';
const DEFAULT_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024; // 5 MB

export class AppStorage {
  private ensureAppDir(appId: string): string {
    this.validateAppId(appId);
    const dir = withoutSymlinks(`${BASE_STORAGE_DIR}/${appId}`);
    if (!vfs.exists(dir)) {
      vfs.mkdir(dir, { recursive: true });
    }
    return dir;
  }

  public validateAppId(appId: string): void {
    if (typeof appId !== 'string' || appId.length > 128 ||
        !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(appId)) {
      throw new Error('Invalid application identifier');
    }
  }

  private getStorageFilePath(appId: string): string {
    const dir = this.ensureAppDir(appId);
    return withoutSymlinks(`${dir}/storage.json`);
  }

  private loadStore(appId: string): Record<string, unknown> {
    const filePath = this.getStorageFilePath(appId);
    if (!vfs.exists(filePath)) {
      return Object.create(null);
    }
    try {
      const raw = vfs.readFile(filePath);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid storage record');
      return Object.assign(Object.create(null), parsed);
    } catch (err) {
      systemLogger.warn('storage', `Corrupted storage for ${appId}, resetting: ${String(err)}`);
      return Object.create(null);
    }
  }

  private saveStore(appId: string, store: Record<string, unknown>): void {
    const filePath = this.getStorageFilePath(appId);
    const serialized = JSON.stringify(store, null, 2);

    this.checkFileQuota(appId, filePath, new TextEncoder().encode(serialized).length);

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

  public checkFileQuota(appId: string, path: string, size: number): void {
    const dirs = [this.ensureAppDir(appId)];
    for (const dir of dirs) {
      for (const entry of vfs.readdir(dir)) {
        if (entry.type === 'dir') dirs.push(entry.path);
        if (entry.type === 'file' && entry.path !== path) size += entry.size;
      }
    }
    if (size > DEFAULT_STORAGE_QUOTA_BYTES) {
      throw new Error(`Application storage quota exceeded (${DEFAULT_STORAGE_QUOTA_BYTES} bytes limit)`);
    }
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
        bytes: new TextEncoder().encode(raw).length,
        keyCount: Object.keys(store).length,
      };
    } catch {
      return { bytes: 0, keyCount: 0 };
    }
  }

  public purgeAppData(appId: string): void {
    this.validateAppId(appId);
    const dir = withoutSymlinks(`${BASE_STORAGE_DIR}/${appId}`);
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

export function resolveAppFilesystemPath(appId: string, value: unknown): { path: string; isPrivate: boolean } {
  appStorage.validateAppId(appId);
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 1024 || (value.includes('\\') || hasControlCharacters(value))) {
    throw new Error('Expected an absolute filesystem path');
  }
  const path = withoutSymlinks(value);
  const isPrivate = isWithin(path, `${BASE_STORAGE_DIR}/${appId}`);
  if ((!isPrivate && isWithin(path, BASE_STORAGE_DIR)) ||
      isWithin(path, '/var/lib/aetherpkg') || isWithin(path, '/opt/aether/apps')) {
    throw new Error('Permission denied: protected application data');
  }
  return { path, isPrivate };
}
