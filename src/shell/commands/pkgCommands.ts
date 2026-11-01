// AetherOS - aetherpkg and aether Developer Shell Command Interfaces
import type { RegisteredCommand, ExecutionResult } from '../types';
import { packageManager } from '../../pkg/packageManager';
import { PackageArchive } from '../../pkg/packageArchive';
import { PackageValidator } from '../../pkg/packageValidator';
import { TEMPLATES } from '../../apps/codeStudio/templates';
import { permissionManager } from '../../appPlatform/PermissionManager';
import { appStorage } from '../../appPlatform/AppStorage';
import { dynamicAppRegistry } from '../../appPlatform/DynamicAppRegistry';
import { vfs } from '../../vfs/vfs';
import { systemEventBus } from '../../core/eventBus';

export const pkgCommands: RegisteredCommand[] = [
  {
    name: 'aetherpkg',
    description: 'AetherOS Package Management Subsystem',
    usage: 'aetherpkg <install|remove|rollback|verify|search|list|info|update> [package|file.aepkg]',
    execute: async (args, context): Promise<ExecutionResult> => {
      const action = args[0];

      if (!action || action === 'help' || action === '--help') {
        const out = `aetherpkg - AetherOS Package Manager 2.0 (Application Ecosystem)

Usage:
  aetherpkg search <query>             Search for available packages
  aetherpkg list                       List all installed packages
  aetherpkg info <package>             Display detailed package metadata
  aetherpkg install <package|file>     Install package from repository or local .aepkg
  aetherpkg remove <package> [--purge] Remove an installed package
  aetherpkg rollback <package>         Roll back an application to previous version
  aetherpkg verify <package|file>      Verify package integrity and manifest
  aetherpkg update                     Synchronize package catalog databases
`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'search') {
        const query = args[1] || '';
        const results = packageManager.search(query);
        const lines = [`\x1b[1;36mFound ${results.length} package(s):\x1b[0m`];
        for (const p of results) {
          const status = p.installed ? '\x1b[1;32m[installed]\x1b[0m' : '\x1b[1;30m[available]\x1b[0m';
          const typeTag = p.isExternal ? '\x1b[1;35m[external]\x1b[0m' : '\x1b[1;34m[built-in]\x1b[0m';
          lines.push(`  \x1b[1m${p.id.padEnd(20, ' ')}\x1b[0m ${status} ${typeTag} v${p.version} - ${p.description}`);
        }
        return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
      }

      if (action === 'list') {
        const installed = packageManager.getInstalled();
        const lines = [`\x1b[1;36mInstalled packages (${installed.length}):\x1b[0m`];
        for (const p of installed) {
          const typeTag = p.isExternal ? '\x1b[1;35m[external]\x1b[0m' : '\x1b[1;34m[built-in]\x1b[0m';
          lines.push(
            `  \x1b[1;32m${p.id.padEnd(24, ' ')}\x1b[0m ${typeTag} v${p.version} (${p.category}) [${p.sizeKb} KiB]`
          );
        }
        return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
      }

      if (action === 'install') {
        const target = args[1];
        if (!target) {
          return { stdout: '', stderr: 'aetherpkg install: missing package name or .aepkg file path\n', exitCode: 1 };
        }

        const resolvedPath = vfs.resolve(context.cwd, target);

        // Check if target is a local .aepkg archive file
        if (target.endsWith('.aepkg') || vfs.exists(resolvedPath)) {
          if (!vfs.exists(resolvedPath)) {
            return { stdout: '', stderr: `aetherpkg install: file not found: '${target}'\n`, exitCode: 1 };
          }
          const res = await packageManager.installFromPath(resolvedPath, { source: 'local' });
          if (!res.success) {
            return { stdout: '', stderr: `E: Installation failed: ${res.error}\n`, exitCode: 1 };
          }
          const out = `Reading archive: ${target}\nVerifying package manifest and SHA-256 integrity... OK\nStaging package to /opt/aether/apps/${res.packageId}/${res.version}...\nRegistering application capabilities and desktop associations...\n\x1b[1;32mSuccessfully installed ${res.packageId} (v${res.version}).\x1b[0m\n`;
          return { stdout: out, stderr: '', exitCode: 0 };
        }

        // Target is a repository package
        const pkg = packageManager.get(target);
        if (!pkg) {
          return { stdout: '', stderr: `E: Unable to locate package ${target}\n`, exitCode: 100 };
        }
        if (pkg.installed) {
          return {
            stdout: `${pkg.name} is already the newest version (${pkg.version}).\n0 upgraded, 0 newly installed.\n`,
            stderr: '',
            exitCode: 0,
          };
        }

        packageManager.install(target);
        const out = `Reading repository package catalog... Done\nEnabling package: ${pkg.name} (${pkg.id} v${pkg.version})\nRegistering desktop launcher entries...\n\x1b[1;32mSuccessfully installed and activated ${pkg.name}.\x1b[0m\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'remove' || action === 'uninstall') {
        const target = args[1];
        if (!target) {
          return { stdout: '', stderr: 'aetherpkg remove: missing package name\n', exitCode: 1 };
        }
        const purge = args.includes('--purge');
        const pkg = packageManager.get(target);
        if (!pkg || !pkg.installed) {
          return { stdout: '', stderr: `Package '${target}' is not installed, so not removed\n`, exitCode: 1 };
        }

        const res = await packageManager.uninstallPackage(target, { purgeData: purge });
        if (!res.success) {
          return { stdout: '', stderr: `E: Failed to remove ${target}: ${res.error}\n`, exitCode: 1 };
        }

        const out = `Removing application package: ${pkg.name} (${pkg.id} v${pkg.version})...\nUnregistering desktop launcher entries...\n${purge ? 'Purging application-private storage directories...\n' : 'Preserving user application data in ~/.local/share/aether/apps/...\n'}\x1b[1;33mSuccessfully uninstalled ${pkg.name}.\x1b[0m\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'rollback') {
        const target = args[1];
        if (!target) {
          return { stdout: '', stderr: 'aetherpkg rollback: missing package name\n', exitCode: 1 };
        }
        const res = await packageManager.rollback(target);
        if (!res.success) {
          return { stdout: '', stderr: `E: Rollback failed: ${res.error}\n`, exitCode: 1 };
        }
        const out = `\x1b[1;32mSuccessfully rolled back ${target} to version ${res.restoredVersion}.\x1b[0m\nUser application data was preserved.\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'verify') {
        const target = args[1];
        if (!target) {
          return { stdout: '', stderr: 'aetherpkg verify: missing package name or file path\n', exitCode: 1 };
        }
        const resolvedPath = vfs.resolve(context.cwd, target);
        const checkTarget = vfs.exists(resolvedPath) ? resolvedPath : target;
        const res = await packageManager.verify(checkTarget);
        if (!res.valid) {
          return {
            stdout: '',
            stderr: `Verification failed:\n${res.errors.map((e) => `  - ${e}`).join('\n')}\n`,
            exitCode: 1,
          };
        }
        return {
          stdout: `\x1b[1;32mVerification succeeded for '${target}'.\x1b[0m\nManifest schema, entry point, and archive integrity confirmed.\n`,
          stderr: '',
          exitCode: 0,
        };
      }

      if (action === 'info') {
        const target = args[1];
        if (!target) return { stdout: '', stderr: 'aetherpkg info: missing package name\n', exitCode: 1 };
        const pkg = packageManager.get(target);
        if (!pkg) return { stdout: '', stderr: `Package ${target} not found\n`, exitCode: 1 };

        let out = `Package: ${pkg.id}\nVersion: ${pkg.version}\nType: ${pkg.isExternal ? 'dynamic / external (.aepkg)' : 'built-in'}\nSection: ${pkg.category.toLowerCase()}\nMaintainer: ${pkg.author}\nInstalled-Size: ${pkg.sizeKb} kB\nStatus: ${pkg.installed ? 'install ok installed' : 'not installed'}\nPermissions: ${pkg.permissions.length > 0 ? pkg.permissions.join(', ') : 'none'}\n`;
        if (pkg.installDir) {
          out += `Install-Directory: ${pkg.installDir}\n`;
        }
        out += `Description: ${pkg.description}\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'update') {
        const res = packageManager.update();
        const out = `Reading package lists... Done\nSynchronized ${res.updated} local and registered package definitions.\nPackage catalog is up to date.\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      return { stdout: '', stderr: `aetherpkg: invalid operation '${action}'\n`, exitCode: 1 };
    },
  },

  {
    name: 'aether',
    description: 'AetherOS Application Developer CLI',
    usage: 'aether <create|validate|build|run|stop|inspect> [args]',
    execute: async (args, context): Promise<ExecutionResult> => {
      const action = args[0];

      if (!action || action === 'help' || action === '--help') {
        const out = `aether - AetherOS Application Developer Toolkit

Usage:
  aether create <name> [--template windowed|cli] Create new app project
  aether validate [path]                         Validate project manifest and assets
  aether build [path]                            Package project into .aepkg archive
  aether run <app-id|path>                       Launch application or preview
  aether stop <app-id>                           Close running application instance
  aether inspect <app-id>                        Inspect application permissions and storage
`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'create') {
        const name = args[1];
        if (!name) {
          return { stdout: '', stderr: 'aether create: missing project name\n', exitCode: 1 };
        }
        const isCli = args.includes('--template') && args[args.indexOf('--template') + 1] === 'cli';
        const tmpl = isCli ? TEMPLATES[1] : TEMPLATES[0];

        const targetDir = vfs.resolve(context.cwd, name);
        if (vfs.exists(targetDir)) {
          return { stdout: '', stderr: `Directory '${targetDir}' already exists\n`, exitCode: 1 };
        }

        vfs.mkdir(targetDir, { recursive: true });
        for (const [relPath, content] of Object.entries(tmpl.files)) {
          vfs.writeFile(`${targetDir}/${relPath}`, content);
        }

        const out = `\x1b[1;32mCreated project '${name}' from template '${tmpl.name}'\x1b[0m\nPath: ${targetDir}\n\nNext steps:\n  cd ${name}\n  aether validate\n  aether build\n  aetherpkg install ./dist/${name}.aepkg\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'validate') {
        const targetPath = vfs.resolve(context.cwd, args[1] || '.');
        const manifestPath = `${targetPath}/manifest.json`;

        if (!vfs.exists(manifestPath)) {
          return { stdout: '', stderr: `Error: 'manifest.json' not found in ${targetPath}\n`, exitCode: 1 };
        }

        try {
          const raw = vfs.readFile(manifestPath);
          const parsed = JSON.parse(raw);
          const res = await PackageValidator.validate(
            new Map([
              ['manifest.json', new TextEncoder().encode(raw)],
              [parsed.entry || 'index.html', new Uint8Array([1])],
            ])
          );
          if (!res.valid) {
            return {
              stdout: '',
              stderr: `Validation failed:\n${res.errors.map((e) => `  - ${e}`).join('\n')}\n`,
              exitCode: 1,
            };
          }
          return {
            stdout: `\x1b[1;32mProject manifest is valid!\x1b[0m\nApp ID: ${parsed.id}\nVersion: ${parsed.version}\nEntry: ${parsed.entry}\n`,
            stderr: '',
            exitCode: 0,
          };
        } catch (err) {
          return { stdout: '', stderr: `Validation error: ${(err as Error).message}\n`, exitCode: 1 };
        }
      }

      if (action === 'build') {
        const targetPath = vfs.resolve(context.cwd, args[1] || '.');
        const manifestPath = `${targetPath}/manifest.json`;

        if (!vfs.exists(manifestPath)) {
          return { stdout: '', stderr: `Error: 'manifest.json' not found in ${targetPath}\n`, exitCode: 1 };
        }

        try {
          const manifestRaw = vfs.readFile(manifestPath);
          const manifest = JSON.parse(manifestRaw);

          const entries = vfs.readdir(targetPath);
          const packFiles = new Map<string, string>();

          for (const entry of entries) {
            if (entry.type === 'file' && !entry.path.includes('/dist/')) {
              const rel = entry.path.replace(targetPath, '').replace(/^\/+/, '');
              packFiles.set(rel, vfs.readFile(entry.path));
            }
          }

          const archiveBytes = await PackageArchive.pack(packFiles);

          const distDir = `${targetPath}/dist`;
          if (!vfs.exists(distDir)) {
            vfs.mkdir(distDir, { recursive: true });
          }
          const outFileName = `${manifest.id || 'package'}.aepkg`;
          const outFilePath = `${distDir}/${outFileName}`;
          await vfs.writeBytes(outFilePath, archiveBytes);

          const out = `\x1b[1;32mPackage built successfully!\x1b[0m\nOutput: ${outFilePath} (${archiveBytes.byteLength} bytes)\nManifest: ${manifest.name} (v${manifest.version})\nFiles packed: ${packFiles.size}\n\nInstall with:\n  aetherpkg install ${outFilePath}\n`;
          return { stdout: out, stderr: '', exitCode: 0 };
        } catch (err) {
          return { stdout: '', stderr: `Build error: ${(err as Error).message}\n`, exitCode: 1 };
        }
      }

      if (action === 'run') {
        const target = args[1];
        if (!target) {
          return { stdout: '', stderr: 'aether run: missing app ID or project path\n', exitCode: 1 };
        }
        if (dynamicAppRegistry.isInstalled(target)) {
          systemEventBus.emit('window:open_requested', { appId: target });
          return { stdout: `Launched application '${target}'.\n`, stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: `Application '${target}' is not installed\n`, exitCode: 1 };
      }

      if (action === 'stop') {
        const target = args[1];
        if (!target) return { stdout: '', stderr: 'aether stop: missing app ID\n', exitCode: 1 };
        systemEventBus.emit('app:close_requested', { appId: target });
        return { stdout: `Sent termination signal to application '${target}'.\n`, stderr: '', exitCode: 0 };
      }

      if (action === 'inspect') {
        const target = args[1];
        if (!target) return { stdout: '', stderr: 'aether inspect: missing app ID\n', exitCode: 1 };
        const app = dynamicAppRegistry.get(target);
        if (!app) {
          return { stdout: '', stderr: `Application '${target}' not found\n`, exitCode: 1 };
        }
        const permRecord = permissionManager.getAppRecord(target);
        const usage = appStorage.getUsage(target);

        let out = `Application: ${app.name} (${app.id})\nVersion: ${app.version}\nInstall Directory: ${app.installDir}\nEntry: ${app.entry}\n`;
        out += `Storage Usage: ${usage.bytes} bytes (${usage.keyCount} keys stored)\n`;
        out += `Permissions:\n`;
        if (permRecord) {
          for (const scope of permRecord.requestedScopes) {
            const state = permRecord.grants[scope] || 'prompt';
            out += `  - ${scope.padEnd(20, ' ')} : ${state}\n`;
          }
        } else {
          out += `  (No permissions requested)\n`;
        }
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      return { stdout: '', stderr: `aether: invalid command '${action}'\n`, exitCode: 1 };
    },
  },
];
