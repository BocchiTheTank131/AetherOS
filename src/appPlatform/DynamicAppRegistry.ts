// AetherOS - Dynamic Application Registry
import type { AppManifest } from './AppManifest';
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
          // Verify that installDir actually exists to avoid dead entries
          if (vfs.exists(rec.installDir)) {
            this.apps.set(id, rec);
          } else {
            systemLogger.warn('appRegistry', `Installed directory missing for app ${id}: ${rec.installDir}`);
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
    try {
      if (!vfs.exists('/var/lib/aetherpkg')) {
        vfs.mkdir('/var/lib/aetherpkg', { recursive: true });
      }
      const data: Record<string, InstalledAppRecord> = {};
      for (const [id, rec] of this.apps.entries()) {
        data[id] = rec;
      }
      vfs.writeFile(REGISTRY_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      systemLogger.error('appRegistry', `Failed to save dynamic apps registry: ${String(err)}`);
    }
  }

  public register(record: InstalledAppRecord): void {
    this.apps.set(record.id, record);
    this.save();
    systemLogger.info('appRegistry', `Dynamically registered app: ${record.name} (${record.id} v${record.version})`);
    this.notify();
    systemEventBus.emit('app:registered', { appId: record.id });
  }

  public unregister(id: string): boolean {
    const existing = this.apps.get(id);
    if (!existing) return false;

    this.apps.delete(id);
    this.save();
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
