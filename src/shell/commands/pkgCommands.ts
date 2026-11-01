// AetherOS - aetherpkg Shell Command Interface
import type { RegisteredCommand, ExecutionResult } from '../types';
import { packageManager } from '../../pkg/packageManager';

export const pkgCommands: RegisteredCommand[] = [
  {
    name: 'aetherpkg',
    description: 'AetherOS Advanced Package Management Utility',
    usage: 'aetherpkg <install|remove|search|list|info|update> [package]',
    execute: (args): ExecutionResult => {
      const action = args[0];

      if (!action || action === 'help') {
        const out = `aetherpkg - AetherOS Package Manager 1.0\n\nUsage: aetherpkg <command> [options]\n\nCommands:\n  search <query>    Search for available packages\n  list              List all installed packages\n  install <pkg>     Install a package from repository\n  remove <pkg>      Remove an installed package\n  info <pkg>        Display detailed package information\n  update            Update package lists from upstream repository\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'search') {
        const query = args[1] || '';
        const results = packageManager.search(query);
        const lines = [`\x1b[1;36mFound ${results.length} package(s):\x1b[0m`];
        for (const p of results) {
          const status = p.installed ? '\x1b[1;32m[installed]\x1b[0m' : '\x1b[1;30m[available]\x1b[0m';
          lines.push(`  \x1b[1m${p.id.padEnd(16, ' ')}\x1b[0m ${status} v${p.version} - ${p.description}`);
        }
        return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
      }

      if (action === 'list') {
        const installed = packageManager.getInstalled();
        const lines = [`\x1b[1;36mInstalled packages (${installed.length}):\x1b[0m`];
        for (const p of installed) {
          lines.push(`  \x1b[1;32m${p.id.padEnd(16, ' ')}\x1b[0m v${p.version} (${p.category}) [${p.sizeKb} KiB]`);
        }
        return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
      }

      if (action === 'install') {
        const target = args[1];
        if (!target) {
          return { stdout: '', stderr: 'aetherpkg install: missing package name\n', exitCode: 1 };
        }
        const pkg = packageManager.get(target);
        if (!pkg) {
          return { stdout: '', stderr: `E: Unable to locate package ${target}\n`, exitCode: 100 };
        }
        if (pkg.installed) {
          return { stdout: `${pkg.name} is already the newest version (${pkg.version}).\n0 upgraded, 0 newly installed.\n`, stderr: '', exitCode: 0 };
        }

        packageManager.install(target);
        const out = `Reading repository package catalog... Done\nEnabling bundled application: ${pkg.name} (${pkg.id} v${pkg.version})\nRegistering desktop launcher entries and MIME handlers...\nUpdating application registry: /var/lib/aetherpkg/installed.json\n\x1b[1;32mSuccessfully installed and activated ${pkg.name}.\x1b[0m\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'remove' || action === 'uninstall') {
        const target = args[1];
        if (!target) {
          return { stdout: '', stderr: 'aetherpkg remove: missing package name\n', exitCode: 1 };
        }
        const pkg = packageManager.get(target);
        if (!pkg || !pkg.installed) {
          return { stdout: '', stderr: `Package '${target}' is not installed, so not removed\n`, exitCode: 1 };
        }

        packageManager.remove(target);
        const out = `Deactivating application: ${pkg.name} (${pkg.id} v${pkg.version})...\nRemoving desktop launcher entries and MIME associations...\nUpdating application registry: /var/lib/aetherpkg/installed.json\n\x1b[1;33mSuccessfully deactivated ${pkg.name}.\x1b[0m\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'info') {
        const target = args[1];
        if (!target) return { stdout: '', stderr: 'aetherpkg info: missing package name\n', exitCode: 1 };
        const pkg = packageManager.get(target);
        if (!pkg) return { stdout: '', stderr: `Package ${target} not found\n`, exitCode: 1 };

        const out = `Package: ${pkg.id}\nVersion: ${pkg.version}\nSection: ${pkg.category.toLowerCase()}\nMaintainer: ${pkg.author}\nInstalled-Size: ${pkg.sizeKb} kB\nStatus: ${pkg.installed ? 'install ok installed' : 'not installed'}\nPermissions: ${pkg.permissions.join(', ')}\nDescription: ${pkg.description}\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      if (action === 'update') {
        packageManager.update();
        const out = `Get:1 https://pkg.aetheros.dev/stable main InRelease [14.2 kB]\nGet:2 https://pkg.aetheros.dev/stable main Packages [86.4 kB]\nFetched 100.6 kB in 0s (342 kB/s)\nReading package lists... Done\nBuilding dependency tree... Done\nAll packages are up to date.\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      }

      return { stdout: '', stderr: `aetherpkg: invalid operation '${action}'\n`, exitCode: 1 };
    },
  },
];
