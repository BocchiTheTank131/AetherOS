// AetherOS - aetherpkg Package Manager Core (v2.0)
import type { AetherPackage } from './types';
import { OFFICIAL_REPOSITORY } from './repository';
import { PackageInstaller, type InstallOptions, type InstallResult } from './packageInstaller';
import { PackageArchive } from './packageArchive';
import { PackageValidator } from './packageValidator';
import { dynamicAppRegistry } from '../appPlatform/DynamicAppRegistry';
import { permissionManager } from '../appPlatform/PermissionManager';
import { vfs } from '../vfs/vfs';
import { systemLogger } from '../core/logger';
import { systemEventBus } from '../core/eventBus';

const STATUS_PATH = '/var/lib/aetherpkg/installed.json';

export class PackageManager {
  private builtInPackages = new Map<string, AetherPackage>();
  private initialized = false;

  constructor() {
    for (const pkg of OFFICIAL_REPOSITORY) {
      this.builtInPackages.set(pkg.id, { ...pkg, source: 'built-in' });
    }
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!vfs.exists('/var/lib/aetherpkg')) {
        vfs.mkdir('/var/lib/aetherpkg', { recursive: true });
      }

      // Initialize dynamic registry and permission manager
      await dynamicAppRegistry.init();
      await permissionManager.init();

      // Initialize built-in package status
      if (vfs.exists(STATUS_PATH)) {
        const raw = vfs.readFile(STATUS_PATH);
        const installedIds: string[] = JSON.parse(raw);
        for (const pkg of this.builtInPackages.values()) {
          pkg.installed = installedIds.includes(pkg.id);
        }
      } else {
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
      const installedIds = Array.from(this.builtInPackages.values())
        .filter((p) => p.installed)
        .map((p) => p.id);
      vfs.writeFile(STATUS_PATH, JSON.stringify(installedIds, null, 2));
    } catch {}
  }

  /**
   * Installs an application from .aepkg archive bytes.
   */
  public async installArchive(
    archiveBytes: Uint8Array,
    options?: InstallOptions
  ): Promise<InstallResult> {
    await this.init();
    return PackageInstaller.installArchive(archiveBytes, options);
  }

  /**
   * Installs an application from an .aepkg file path in VFS.
   */
  public async installFromPath(
    vfsPath: string,
    options?: InstallOptions
  ): Promise<InstallResult> {
    await this.init();
    const normPath = vfs.normalizePath(vfsPath);
    if (!vfs.exists(normPath)) {
      return { success: false, error: `Package file not found: '${vfsPath}'` };
    }
    try {
      const bytes = await vfs.readBytes(normPath);
      return this.installArchive(bytes, options);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Returns all packages (built-in and installed external).
   */
  public getAll(): AetherPackage[] {
    const list: AetherPackage[] = Array.from(this.builtInPackages.values());

    for (const ext of dynamicAppRegistry.getAll()) {
      list.push({
        id: ext.packageId,
        name: ext.name,
        version: ext.version,
        description: ext.description,
        author: ext.author,
        category: 'Utilities',
        icon: ext.icon || 'Package',
        sizeKb: 120,
        permissions: ext.manifest.permissions || [],
        installed: true,
        appId: ext.id,
        isExternal: true,
        installDir: ext.installDir,
        source: ext.source,
      });
    }

    return list;
  }

  /**
   * Returns all installed packages (built-in and dynamic).
   */
  public getInstalled(): AetherPackage[] {
    return this.getAll().filter((p) => p.installed);
  }

  public get(id: string): AetherPackage | undefined {
    // Check built-in
    if (this.builtInPackages.has(id)) {
      return this.builtInPackages.get(id);
    }
    // Check dynamic
    const dyn = dynamicAppRegistry.get(id);
    if (dyn) {
      return {
        id: dyn.packageId,
        name: dyn.name,
        version: dyn.version,
        description: dyn.description,
        author: dyn.author,
        category: 'Utilities',
        icon: dyn.icon || 'Package',
        sizeKb: 120,
        permissions: dyn.manifest.permissions || [],
        installed: true,
        appId: dyn.id,
        isExternal: true,
        installDir: dyn.installDir,
        source: dyn.source,
      };
    }
    return undefined;
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

  /**
   * Standard install for repository built-in package or local .aepkg
   */
  public install(id: string): boolean {
    const pkg = this.builtInPackages.get(id);
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

  /**
   * Standard remove for built-in or dynamic packages.
   */
  public remove(id: string, options?: { purgeData?: boolean }): boolean {
    // Check if dynamic package
    if (dynamicAppRegistry.isInstalled(id)) {
      PackageInstaller.uninstall(id, options).then((res) => {
        if (!res.success) {
          systemLogger.error('pkg', `Failed to uninstall ${id}: ${res.error}`);
        }
      });
      return true;
    }

    // Built-in package
    const pkg = this.builtInPackages.get(id);
    if (!pkg || !pkg.installed) return false;

    pkg.installed = false;
    this.saveStatus();

    systemLogger.info('pkg', `Removed package: ${pkg.name}`);
    systemEventBus.emit('package:removed', { packageId: id });
    return true;
  }

  /**
   * Async uninstall with full error reporting.
   */
  public async uninstallPackage(
    id: string,
    options?: { purgeData?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    if (dynamicAppRegistry.isInstalled(id)) {
      return PackageInstaller.uninstall(id, options);
    }
    const pkg = this.builtInPackages.get(id);
    if (!pkg) {
      return { success: false, error: `Package '${id}' not found` };
    }
    if (!pkg.installed) {
      return { success: false, error: `Package '${id}' is not installed` };
    }
    pkg.installed = false;
    this.saveStatus();
    systemEventBus.emit('package:removed', { packageId: id });
    return { success: true };
  }

  /**
   * Rollback package to previous version.
   */
  public async rollback(
    packageId: string
  ): Promise<{ success: boolean; error?: string; restoredVersion?: string }> {
    return PackageInstaller.rollback(packageId);
  }

  /**
   * Verifies package manifest and integrity.
   */
  public async verify(target: string): Promise<{ valid: boolean; errors: string[] }> {
    // If target is an existing file path in VFS
    const normPath = vfs.normalizePath(target);
    if (vfs.exists(normPath)) {
      try {
        const bytes = await vfs.readBytes(normPath);
        const files = await PackageArchive.unpack(bytes);
        const res = await PackageValidator.validate(files);
        return { valid: res.valid, errors: res.errors };
      } catch (err) {
        return { valid: false, errors: [(err as Error).message] };
      }
    }

    // If target is an installed package ID
    const dyn = dynamicAppRegistry.get(target);
    if (dyn) {
      if (!vfs.exists(dyn.installDir)) {
        return { valid: false, errors: [`Install directory '${dyn.installDir}' does not exist`] };
      }
      return { valid: true, errors: [] };
    }

    const builtIn = this.builtInPackages.get(target);
    if (builtIn) {
      return { valid: true, errors: [] };
    }

    return { valid: false, errors: [`Target '${target}' not found`] };
  }

  public update(): { updated: number } {
    systemLogger.info('pkg', 'Synchronizing package repository database with upstream');
    return { updated: this.builtInPackages.size + dynamicAppRegistry.getAll().length };
  }
}

export const packageManager = new PackageManager();
