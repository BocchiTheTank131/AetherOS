// AetherOS - aesh Environment & Variable/Glob Expansion
import type { ShellContext } from './types';
import { vfs } from '../vfs/vfs';

export function createDefaultShellContext(user = 'aether'): ShellContext {
  return {
    cwd: user === 'root' ? '/root' : `/home/${user}`,
    env: {
      USER: user,
      HOME: user === 'root' ? '/root' : `/home/${user}`,
      SHELL: '/bin/aesh',
      PATH: '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin',
      PWD: user === 'root' ? '/root' : `/home/${user}`,
      TERM: 'xterm-256color',
      HOSTNAME: 'aetheros',
      LANG: 'en_US.UTF-8',
      OS: 'AetherOS',
      KERNEL: 'AetherCore',
      '?': '0',
    },
    aliases: {
      ll: 'ls -lah',
      la: 'ls -A',
      l: 'ls -CF',
      cls: 'clear',
      '..': 'cd ..',
      '...': 'cd ../..',
    },
    functions: {},
    jobs: new Map(),
    history: [],
    exitCode: 0,
    user,
    hostname: 'aetheros',
  };
}

/**
 * Expand variables like $VAR, ${VAR}, $?, $#, $@, $*, $$, $0..$9, ${VAR:-default}
 */
export function expandVariables(text: string, context: ShellContext): string {
  return text.replace(
    /\$(?:\{([^}]+)\}|([a-zA-Z0-9_?#@*$]+))/g,
    (_, braced, bare) => {
      const expr = braced || bare;
      if (!expr) return '$';

      // Default value expansion ${VAR:-default}
      if (expr.includes(':-')) {
        const idx = expr.indexOf(':-');
        const varName = expr.slice(0, idx);
        const defVal = expr.slice(idx + 2);
        const val = context.env[varName];
        return val !== undefined && val !== '' ? val : defVal;
      }

      // Alternate value expansion ${VAR:+alternate}
      if (expr.includes(':+')) {
        const idx = expr.indexOf(':+');
        const varName = expr.slice(0, idx);
        const altVal = expr.slice(idx + 2);
        const val = context.env[varName];
        return val !== undefined && val !== '' ? altVal : '';
      }

      if (expr === '?') {
        return String(context.exitCode);
      }
      if (expr === '#') {
        return String(context.positionalArgs ? context.positionalArgs.length : 0);
      }
      if (expr === '@' || expr === '*') {
        return (context.positionalArgs || []).join(' ');
      }
      if (expr === '$') {
        return '100'; // Default virtual PID
      }
      if (expr === '0') {
        return context.scriptName || 'aesh';
      }
      if (/^\d+$/.test(expr)) {
        const num = parseInt(expr, 10);
        const args = context.positionalArgs || [];
        return num > 0 && num <= args.length ? args[num - 1] : '';
      }

      return context.env[expr] !== undefined ? context.env[expr] : '';
    }
  );
}

/**
 * Expand glob patterns (* and ?) in a token against VFS in cwd
 */
export function expandGlobs(pattern: string, cwd: string): string[] {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return [pattern];
  }

  try {
    const isDirSearch = pattern.includes('/');
    let targetDir = cwd;
    let filePattern = pattern;
    let dirPrefix = '';

    if (isDirSearch) {
      const lastSlash = pattern.lastIndexOf('/');
      const dirPart = pattern.substring(0, lastSlash);
      targetDir = vfs.resolve(cwd, dirPart || '/');
      filePattern = pattern.substring(lastSlash + 1);
      dirPrefix = dirPart ? dirPart + '/' : '/';
    }

    if (!vfs.exists(targetDir)) {
      return [pattern];
    }

    const entries = vfs.readdir(targetDir);
    // Convert glob pattern to RegExp
    const regexPattern =
      '^' +
      filePattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$';
    const regex = new RegExp(regexPattern);

    const includeHidden = filePattern.startsWith('.');
    const matches = entries
      .filter((e) => {
        if (!includeHidden && e.name.startsWith('.')) return false;
        return regex.test(e.name);
      })
      .map((e) => (isDirSearch ? `${dirPrefix}${e.name}` : e.name));

    if (matches.length === 0) {
      return [pattern];
    }

    return matches.sort();
  } catch {
    return [pattern];
  }
}
