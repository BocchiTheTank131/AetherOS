// AetherOS - Transactional Package Installer & Lifecycle Orchestrator
import { PackageArchive } from './packageArchive';
import { PackageValidator } from './packageValidator';
import { PackageResolver, compareSemver } from './packageResolver';
import { PackageRollback } from './packageRollback';
import { dynamicAppRegistry } from '../appPlatform/DynamicAppRegistry';
import { permissionManager } from '../appPlatform/PermissionManager';
import { appStorage } from '../appPlatform/AppStorage';
import { fileAssociations } from '../appPlatform/FileAssociations';
import { AETHER_VERSION } from '../core/version';
import { vfs } from '../vfs/vfs';
import { systemLogger } from '../core/logger';
import { systemEventBus } from '../core/eventBus';

const APPS_INSTALL_ROOT = '/opt/aether/apps';

export interface InstallOptions {
  source?: 'local' | 'repository';
  onProgress?: (stage: string, percent?: number) => void;
  autoGrantLowRisk?: boolean;
}

export interface InstallResult {
  success: boolean;
  packageId?: string;
  version?: string;
  error?: string;
  warnings?: string[];
}

export class PackageInstaller {
  /**
   * Installs an application from .aepkg archive bytes.
   */
  public static async installArchive(
    archiveBytes: Uint8Array,
    options?: InstallOptions
  ): Promise<InstallResult> {
    const report = (stage: string) => {
      systemLogger.info('installer', stage);
      options?.onProgress?.(stage);
    };

    try {
      report('Verifying archive structure...');
      const files = await PackageArchive.unpack(archiveBytes);

      report('Validating manifest and integrity...');
      const validation = await PackageValidator.validate(files);
      if (!validation.valid || !validation.manifest) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join('; ')}`,
        };
      }

      const manifest = validation.manifest;
      const pkgId = manifest.id;
      const version = manifest.version;

      // Check minAetherVersion compatibility
      if (manifest.minAetherVersion) {
        if (compareSemver(AETHER_VERSION.version, manifest.minAetherVersion) < 0) {
          return {
            success: false,
            error: `Incompatible OS version: package requires AetherOS >= ${manifest.minAetherVersion}, current version is ${AETHER_VERSION.version}`,
          };
        }
      }

      report('Resolving dependencies...');
      if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
        const depCheck = PackageResolver.verifyDependencies(
          manifest.dependencies,
          (id) => dynamicAppRegistry.get(id)?.version
        );
        if (!depCheck.satisfied) {
          const missingMsg = depCheck.missing
            .map((m) => `${m.id}@${m.requiredVersion}`)
            .join(', ');
          const incompMsg = depCheck.incompatible
            .map((i) => `${i.id} (installed: ${i.installedVersion}, required: ${i.requiredVersion})`)
            .join(', ');
          return {
            success: false,
            error: `Unmet dependencies: ${missingMsg ? 'Missing: ' + missingMsg : ''} ${incompMsg ? 'Incompatible: ' + incompMsg : ''}`.trim(),
          };
        }
      }

      // Check if updating an existing version
      const existing = dynamicAppRegistry.get(pkgId);
      if (existing) {
        // Record current version in rollback history
        PackageRollback.recordVersion(pkgId, {
          version: existing.version,
          manifest: existing.manifest,
          installedAt: existing.installedAt,
          installDir: existing.installDir,
        });
      }

      report('Staging files...');
      const installDir = `${APPS_INSTALL_ROOT}/${pkgId}/${version}`;
      const systemCtx = { user: 'root', uid: 0 };
      if (!vfs.exists(installDir)) {
        vfs.mkdir(installDir, { recursive: true, context: systemCtx, owner: 'aether', group: 'aether', permissions: 0o775 });
      }

      // Write all archive files into install directory
      for (const [relPath, content] of files.entries()) {
        const destPath = `${installDir}/${relPath}`;
        const dir = destPath.substring(0, destPath.lastIndexOf('/'));
        if (!vfs.exists(dir)) {
          vfs.mkdir(dir, { recursive: true, context: systemCtx, owner: 'aether', group: 'aether', permissions: 0o775 });
        }
        await vfs.writeBytes(destPath, content, { context: systemCtx, owner: 'aether', group: 'aether', permissions: 0o755 });
      }

      report('Registering permissions and security boundaries...');
      if (manifest.permissions) {
        permissionManager.registerApp(pkgId, manifest.permissions, options?.autoGrantLowRisk ?? true);
      }

      report('Registering application metadata...');
      const now = new Date().toISOString();
      dynamicAppRegistry.register({
        id: pkgId,
        packageId: pkgId,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        type: manifest.type,
        entry: manifest.entry,
        icon: manifest.icon,
        installDir,
        manifest,
        installedAt: existing ? existing.installedAt : now,
        updatedAt: now,
        source: options?.source || 'local',
      });

      if (manifest.fileAssociations) {
        fileAssociations.registerAssociations(pkgId, manifest.fileAssociations);
      }

      report('Completed');
      systemEventBus.emit(existing ? 'package:updated' : 'package:installed', {
        packageId: pkgId,
        version,
      });

      return {
        success: true,
        packageId: pkgId,
        version,
      };
    } catch (err) {
      const msg = (err as Error).message || String(err);
      systemLogger.error('installer', `Installation error: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Uninstalls a dynamic application package.
   */
  public static async uninstall(
    packageId: string,
    options?: { purgeData?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    const existing = dynamicAppRegistry.get(packageId);
    if (!existing) {
      return { success: false, error: `Package '${packageId}' is not installed` };
    }

    try {
      // 1. Emit window close request for this application
      systemEventBus.emit('app:close_requested', { appId: packageId });

      // 2. Unregister from dynamic registry
      dynamicAppRegistry.unregister(packageId);

      // 3. Unregister file associations
      fileAssociations.unregisterAssociations(packageId);

      // 4. Remove program files from /opt/aether/apps/<packageId>/
      const basePkgDir = `${APPS_INSTALL_ROOT}/${packageId}`;
      if (vfs.exists(basePkgDir)) {
        try {
          vfs.rmdir(basePkgDir, { recursive: true });
        } catch (err) {
          systemLogger.warn('installer', `Failed to remove ${basePkgDir}: ${String(err)}`);
        }
      }

      // 5. Purge app data if requested
      if (options?.purgeData) {
        appStorage.purgeAppData(packageId);
        permissionManager.unregisterApp(packageId);
      }

      // 6. Clear rollback history
      PackageRollback.clearHistory(packageId);

      systemEventBus.emit('package:removed', { packageId });
      systemLogger.info('installer', `Successfully uninstalled package: ${packageId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Rolls back an application to its previous installed version.
   */
  public static async rollback(packageId: string): Promise<{ success: boolean; error?: string; restoredVersion?: string }> {
    const current = dynamicAppRegistry.get(packageId);
    if (!current) {
      return { success: false, error: `Package '${packageId}' is not installed` };
    }

    const prev = PackageRollback.getPreviousVersion(packageId, current.version);
    if (!prev) {
      return { success: false, error: `No rollback version available for package '${packageId}'` };
    }

    if (!vfs.exists(prev.installDir)) {
      return {
        success: false,
        error: `Previous version files at '${prev.installDir}' are missing`,
      };
    }

    // Restore dynamic app registry record
    dynamicAppRegistry.register({
      id: packageId,
      packageId,
      name: prev.manifest.name,
      version: prev.version,
      description: prev.manifest.description,
      author: prev.manifest.author,
      type: prev.manifest.type,
      entry: prev.manifest.entry,
      icon: prev.manifest.icon,
      installDir: prev.installDir,
      manifest: prev.manifest,
      installedAt: current.installedAt,
      updatedAt: new Date().toISOString(),
      source: current.source,
    });

    systemEventBus.emit('package:updated', { packageId, version: prev.version });
    systemLogger.info('installer', `Rolled back package '${packageId}' to v${prev.version}`);
    return { success: true, restoredVersion: prev.version };
  }
}
