// AetherOS - Dynamic Application Registry
import { isAppId, validateManifest, type AppManifest } from './AppManifest';
import { relativeFilePath, isWithin, withoutSymlinks } from '../vfs/safePath';
import { vfs } from '../vfs/vfs';
import { systemLogger } from '../core/logger';
import { systemEventBus } from '../core/eventBus';

export interface InstalledAppRecord {
  id: string; // Unique application ID, e.g. dev.aether.hello
  packageId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: 'windowed' | 'cli';
  entry: string; // relative path within installDir
  icon?: string;
  installDir: string; // e.g. /opt/aether/apps/dev.aether.hello/1.0.0
  manifest: AppManifest;
  installedAt: string;
  updatedAt: string;
  source: 'local' | 'repository';
}

const REGISTRY_FILE = '/var/lib/aetherpkg/installed_v2.json';

export class DynamicAppRegistry {
  private apps = new Map<string, InstalledAppRecord>();
  private listeners = new Set<() => void>();
  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!vfs.exists('/var/lib/aetherpkg')) {
        vfs.mkdir('/var/lib/aetherpkg', { recursive: true });
      }

      if (vfs.exists(REGISTRY_FILE)) {
        const raw = vfs.readFile(REGISTRY_FILE);
        const parsed: Record<string, InstalledAppRecord> = JSON.parse(raw);
        for (const [id, rec] of Object.entries(parsed)) {
          try {
            this.validate(rec);
            if (id !== rec.id) throw new Error('Mismatched application ID');
            this.apps.set(id, rec);
          } catch (error) {
            systemLogger.warn('appRegistry', `Skipped invalid app ${id}: ${String(error)}`);
          }
        }
      }
      this.initialized = true;
    } catch (err) {
      systemLogger.warn('appRegistry', `Failed to load dynamic apps: ${String(err)}`);
      this.initialized = true;
    }
  }

  private save(): void {
    const path = withoutSymlinks(REGISTRY_FILE);
    vfs.mkdir('/var/lib/aetherpkg', { recursive: true });
    vfs.writeFile(path, JSON.stringify(Object.fromEntries(this.apps), null, 2));
  }

  private validate(record: InstalledAppRecord): void {
    if (!isAppId(record.id) || record.packageId !== record.id ||
        !isWithin(record.installDir, `/opt/aether/apps/${record.id}`) ||
        withoutSymlinks(record.installDir) !== record.installDir ||
        !validateManifest(record.manifest).valid || record.manifest.id !== record.id ||
        record.manifest.version !== record.version ||
        relativeFilePath(record.entry) !== relativeFilePath(record.manifest.entry) ||
        !vfs.stat(withoutSymlinks(`${record.installDir}/${relativeFilePath(record.entry)}`)).isFile()) {
      throw new Error('Invalid application registry record');
    }
  }

  public register(record: InstalledAppRecord): void {
    this.validate(record);
    const previous = this.apps.get(record.id);
    this.apps.set(record.id, record);
    try {
      this.save();
    } catch (error) {
      if (previous) this.apps.set(record.id, previous);
      else this.apps.delete(record.id);
      throw error;
    }
    systemLogger.info('appRegistry', `Dynamically registered app: ${record.name} (${record.id} v${record.version})`);
    this.notify();
    systemEventBus.emit('app:registered', { appId: record.id });
  }

  public unregister(id: string): boolean {
    const existing = this.apps.get(id);
    if (!existing) return false;

    this.apps.delete(id);
    try {
      this.save();
    } catch (error) {
      this.apps.set(id, existing);
      throw error;
    }
    systemLogger.info('appRegistry', `Unregistered dynamic app: ${id}`);
    this.notify();
    systemEventBus.emit('app:unregistered', { appId: id });
    return true;
  }

  public get(id: string): InstalledAppRecord | undefined {
    return this.apps.get(id);
  }

  public getAll(): InstalledAppRecord[] {
    return Array.from(this.apps.values());
  }

  public isInstalled(id: string): boolean {
    return this.apps.has(id);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {}
    }
  }
}

export const dynamicAppRegistry = new DynamicAppRegistry();
