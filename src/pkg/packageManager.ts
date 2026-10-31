// AetherOS - aetherpkg Package Manager Core
import type { AetherPackage } from './types';
import { OFFICIAL_REPOSITORY } from './repository';
import { vfs } from '../vfs/vfs';
import { systemLogger } from '../core/logger';
import { systemEventBus } from '../core/eventBus';

const STATUS_PATH = '/var/lib/aetherpkg/installed.json';

export class PackageManager {
  private packages = new Map<string, AetherPackage>();
  private initialized = false;

  constructor() {
    for (const pkg of OFFICIAL_REPOSITORY) {
      this.packages.set(pkg.id, { ...pkg });
    }
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!vfs.exists('/var/lib/aetherpkg')) {
        vfs.mkdir('/var/lib/aetherpkg', { recursive: true });
      }

      if (vfs.exists(STATUS_PATH)) {
        const raw = vfs.readFile(STATUS_PATH);
        const installedIds: string[] = JSON.parse(raw);
        for (const pkg of this.packages.values()) {
          pkg.installed = installedIds.includes(pkg.id);
        }
      } else {
        // Save initial status
        this.saveStatus();
      }
      this.initialized = true;
    } catch (err) {
      systemLogger.warn('pkg', `Package manager init notice: ${String(err)}`);
      this.initialized = true;
    }
  }

  private saveStatus(): void {
    try {
      const installedIds = Array.from(this.packages.values())
        .filter((p) => p.installed)
        .map((p) => p.id);
      vfs.writeFile(STATUS_PATH, JSON.stringify(installedIds, null, 2));
    } catch {}
  }

  public getAll(): AetherPackage[] {
    return Array.from(this.packages.values());
  }

  public getInstalled(): AetherPackage[] {
    return Array.from(this.packages.values()).filter((p) => p.installed);
  }

  public get(id: string): AetherPackage | undefined {
    return this.packages.get(id);
  }

  public search(query: string): AetherPackage[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getAll();
    return this.getAll().filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }

  public install(id: string): boolean {
    const pkg = this.packages.get(id);
    if (!pkg) {
      systemLogger.error('pkg', `Package '${id}' not found in official repository`);
      return false;
    }

    if (pkg.installed) {
      systemLogger.info('pkg', `Package '${id}' is already installed`);
      return true;
    }

    pkg.installed = true;
    this.saveStatus();

    systemLogger.info('pkg', `Installed package: ${pkg.name} (${pkg.version})`);
    systemEventBus.emit('package:installed', { packageId: id });
    return true;
  }

  public remove(id: string): boolean {
    const pkg = this.packages.get(id);
    if (!pkg) return false;
    if (!pkg.installed) return false;

    pkg.installed = false;
    this.saveStatus();

    systemLogger.info('pkg', `Removed package: ${pkg.name}`);
    systemEventBus.emit('package:removed', { packageId: id });
    return true;
  }

  public update(): { updated: number } {
    systemLogger.info('pkg', 'Synchronizing package repository database with upstream');
    return { updated: this.packages.size };
  }
}

export const packageManager = new PackageManager();
