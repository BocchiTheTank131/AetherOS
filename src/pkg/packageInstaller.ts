// AetherOS - Transactional Package Installer & Lifecycle Orchestrator
import { PackageArchive } from './packageArchive';
import { PackageValidator } from './packageValidator';
import { PackageResolver, compareSemver, satisfiesSemver } from './packageResolver';
import { PackageRollback } from './packageRollback';
import { dynamicAppRegistry } from '../appPlatform/DynamicAppRegistry';
import { permissionManager } from '../appPlatform/PermissionManager';
import { appStorage } from '../appPlatform/AppStorage';
import { fileAssociations } from '../appPlatform/FileAssociations';
import { AETHER_VERSION } from '../core/version';
import { isAppId } from '../appPlatform/AppManifest';
import { isWithin, withoutSymlinks } from '../vfs/safePath';
import { idbStorage } from '../vfs/idbStorage';
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

      const visited = new Set<string>();
      const queue = Object.keys(manifest.dependencies ?? {});
      for (const id of queue) {
        if (id === pkgId) throw new Error(`Dependency cycle involving ${pkgId}`);
        if (visited.has(id)) continue;
        visited.add(id);
        queue.push(...Object.keys(dynamicAppRegistry.get(id)?.manifest.dependencies ?? {}));
      }

      const existing = dynamicAppRegistry.get(pkgId);
      for (const dependent of dynamicAppRegistry.getAll()) {
        const range = dependent.manifest.dependencies?.[pkgId];
        if (range && !satisfiesSemver(version, range)) {
          throw new Error(`${dependent.id} requires ${pkgId}@${range}`);
        }
      }

      report('Staging files and metadata...');
      const versionDir = withoutSymlinks(`${APPS_INSTALL_ROOT}/${pkgId}/${version}`);
      const installDir = vfs.exists(versionDir) ? versionDir + '-' + crypto.randomUUID() : versionDir;
      const systemCtx = { user: 'root', uid: 0 };
      const now = new Date().toISOString();
      vfs.atomicBatch(() => {
        vfs.mkdir(installDir, { recursive: true, context: systemCtx });
        for (const [relPath, content] of files) {
          const destPath = `${installDir}/${relPath}`;
          const dir = destPath.slice(0, destPath.lastIndexOf('/'));
          vfs.mkdir(dir, { recursive: true, context: systemCtx });
          vfs.writeBytesSync(destPath, content, { context: systemCtx, permissions: 0o644 });
        }

        dynamicAppRegistry.register({
          id: pkgId,
          packageId: pkgId,
          name: manifest.name,
          version,
          description: manifest.description,
          author: manifest.author,
          type: manifest.type,
          entry: manifest.entry,
          icon: manifest.icon,
          installDir,
          manifest,
          installedAt: existing?.installedAt ?? now,
          updatedAt: now,
          source: options?.source ?? 'local',
        });

        permissionManager.registerApp(pkgId, manifest.permissions ?? [], options?.autoGrantLowRisk ?? true);
        if (existing) PackageRollback.recordVersion(pkgId, existing);
      });

      if (existing) systemEventBus.emit('app:close_requested', { appId: pkgId });
      fileAssociations.unregisterAssociations(pkgId);
      fileAssociations.registerAssociations(pkgId, manifest.fileAssociations ?? []);
      const persisted = await vfs.flush();
      const warnings = [...(validation.warnings ?? [])];
      if (!persisted && (typeof window !== 'undefined' || idbStorage.getPersistenceStatus() !== 'unavailable')) {
        warnings.push('Package is installed in this tab, but AetherFS could not persist the installation.');
      }
      systemEventBus.emit(existing ? 'package:updated' : 'package:installed', { packageId: pkgId, version });
      return { success: true, packageId: pkgId, version, warnings };
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
      if (!isAppId(packageId)) throw new Error('Invalid package identifier');
      const dependent = dynamicAppRegistry.getAll().find((app) => Object.hasOwn(app.manifest.dependencies ?? {}, packageId));
      if (dependent) throw new Error(`${dependent.id} depends on ${packageId}`);
      const basePkgDir = withoutSymlinks(`${APPS_INSTALL_ROOT}/${packageId}`);
      vfs.atomicBatch(() => {
        if (vfs.exists(basePkgDir)) vfs.rmdir(basePkgDir, { recursive: true });
        if (options?.purgeData) {
          appStorage.purgeAppData(packageId);
          permissionManager.unregisterApp(packageId);
        }
        PackageRollback.clearHistory(packageId);
        dynamicAppRegistry.unregister(packageId);
      });
      systemEventBus.emit('app:close_requested', { appId: packageId });
      fileAssociations.unregisterAssociations(packageId);
      await vfs.flush();
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

    if (!isAppId(packageId) || !isWithin(prev.installDir, `${APPS_INSTALL_ROOT}/${packageId}`) ||
        withoutSymlinks(prev.installDir) !== prev.installDir || !vfs.exists(prev.installDir)) {
      return {
        success: false,
        error: `Previous version files at '${prev.installDir}' are missing`,
      };
    }

    const deps = PackageResolver.verifyDependencies(prev.manifest.dependencies ?? {}, (id) => dynamicAppRegistry.get(id)?.version);
    if (!deps.satisfied) return { success: false, error: 'The rollback version has unmet dependencies' };
    for (const dependent of dynamicAppRegistry.getAll()) {
      const range = dependent.manifest.dependencies?.[packageId];
      if (range && !satisfiesSemver(prev.version, range)) {
        return { success: false, error: `${dependent.id} requires ${packageId}@${range}` };
      }
    }

    vfs.atomicBatch(() => {
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
      PackageRollback.recordVersion(packageId, current);
    });
    fileAssociations.unregisterAssociations(packageId);
    fileAssociations.registerAssociations(packageId, prev.manifest.fileAssociations ?? []);
    systemEventBus.emit('app:close_requested', { appId: packageId });
    await vfs.flush();

    systemEventBus.emit('package:updated', { packageId, version: prev.version });
    systemLogger.info('installer', `Rolled back package '${packageId}' to v${prev.version}`);
    return { success: true, restoredVersion: prev.version };
  }
}
