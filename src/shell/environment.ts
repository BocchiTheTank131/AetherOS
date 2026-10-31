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
    history: [],
    exitCode: 0,
    user,
    hostname: 'aetheros',
  };
}

/**
 * Expand variables like $VAR, ${VAR}, $?
 */
export function expandVariables(text: string, context: ShellContext): string {
  // Regex to match $VAR, ${VAR}, or $?
  return text.replace(/\$(?:\{([a-zA-Z0-9_?]+)\}|([a-zA-Z0-9_?]+))/g, (_, br, bare) => {
    const varName = br || bare;
    if (varName === '?') {
      return String(context.exitCode);
    }
    return context.env[varName] !== undefined ? context.env[varName] : '';
  });
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
