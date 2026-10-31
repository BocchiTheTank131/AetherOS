// AetherOS - Filesystem Shell Commands
import type { RegisteredCommand, ExecutionResult } from '../types';
import { vfs } from '../../vfs/vfs';

export const fsCommands: RegisteredCommand[] = [
  {
    name: 'ls',
    description: 'List directory contents',
    usage: 'ls [-a] [-l] [-h] [-lah] [path...]',
    manual: 'ls - list directory contents. Supports -a (all), -l (long format), -h (human readable).',
    execute: async (args, context): Promise<ExecutionResult> => {
      let showAll = false;
      let longFormat = false;
      const paths: string[] = [];

      for (const arg of args) {
        if (arg.startsWith('-')) {
          if (arg.includes('a') || arg.includes('A')) showAll = true;
          if (arg.includes('l')) longFormat = true;
        } else {
          paths.push(arg);
        }
      }

      const formatTarget = (
        targetPath: string,
        displayName?: string
      ): { stdout: string; stderr: string; exitCode: number } => {
        try {
          const stats = vfs.stat(targetPath);
          if (stats.isFile()) {
            if (longFormat) {
              const permStr =
                '-' +
                ((stats.permissions & 0o400) ? 'r' : '-') +
                ((stats.permissions & 0o200) ? 'w' : '-') +
                ((stats.permissions & 0o100) ? 'x' : '-') +
                ((stats.permissions & 0o040) ? 'r' : '-') +
                ((stats.permissions & 0o020) ? 'w' : '-') +
                ((stats.permissions & 0o010) ? 'x' : '-') +
                ((stats.permissions & 0o004) ? 'r' : '-') +
                ((stats.permissions & 0o002) ? 'w' : '-') +
                ((stats.permissions & 0o001) ? 'x' : '-');
              const sizeStr = stats.size.toString().padStart(6, ' ');
              const dateStr = new Date(stats.modifiedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              });
              const colorName =
                stats.permissions & 0o111
                  ? `\x1b[1;32m${displayName || stats.name}*\x1b[0m`
                  : displayName || stats.name;
              return {
                stdout: `${permStr} 1 ${stats.owner.padEnd(6, ' ')} aether ${sizeStr} ${dateStr} ${colorName}\n`,
                stderr: '',
                exitCode: 0,
              };
            }
            return { stdout: (displayName || stats.name) + '\n', stderr: '', exitCode: 0 };
          }

          const entries = vfs.readdir(targetPath);
          const filtered = showAll ? entries : entries.filter((e) => !e.name.startsWith('.'));

          if (!longFormat) {
            const names = filtered.map((e) => {
              if (e.type === 'dir') return `\x1b[1;34m${e.name}/\x1b[0m`;
              if (e.name.endsWith('.sh') || (e.permissions & 0o111)) return `\x1b[1;32m${e.name}*\x1b[0m`;
              return e.name;
            });
            return { stdout: names.join('  ') + (names.length > 0 ? '\n' : ''), stderr: '', exitCode: 0 };
          }

          // Long format
          const lines: string[] = [`total ${filtered.length * 4}`];
          for (const e of filtered) {
            const isDir = e.type === 'dir';
            const permStr =
              (isDir ? 'd' : '-') +
              ((e.permissions & 0o400) ? 'r' : '-') +
              ((e.permissions & 0o200) ? 'w' : '-') +
              ((e.permissions & 0o100) ? 'x' : '-') +
              ((e.permissions & 0o040) ? 'r' : '-') +
              ((e.permissions & 0o020) ? 'w' : '-') +
              ((e.permissions & 0o010) ? 'x' : '-') +
              ((e.permissions & 0o004) ? 'r' : '-') +
              ((e.permissions & 0o002) ? 'w' : '-') +
              ((e.permissions & 0o001) ? 'x' : '-');

            const sizeStr = e.size.toString().padStart(6, ' ');
            const dateStr = new Date(e.modifiedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });

            const colorName = isDir
              ? `\x1b[1;34m${e.name}/\x1b[0m`
              : (e.permissions & 0o111)
              ? `\x1b[1;32m${e.name}*\x1b[0m`
              : e.name;

            lines.push(`${permStr} 1 ${e.owner.padEnd(6, ' ')} aether ${sizeStr} ${dateStr} ${colorName}`);
          }

          return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
        } catch {
          return {
            stdout: '',
            stderr: `ls: cannot access '${displayName || targetPath}': No such file or directory\n`,
            exitCode: 2,
          };
        }
      };

      if (paths.length === 0) {
        return formatTarget(context.cwd);
      }

      if (paths.length === 1) {
        const targetPath = vfs.resolve(context.cwd, paths[0]);
        return formatTarget(targetPath, paths[0]);
      }

      let combinedOut = '';
      let combinedErr = '';
      let maxExit = 0;

      for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        const resPath = vfs.resolve(context.cwd, p);
        const res = formatTarget(resPath, p);
        if (res.exitCode !== 0) {
          combinedErr += res.stderr;
          maxExit = Math.max(maxExit, res.exitCode);
        } else {
          try {
            const stat = vfs.stat(resPath);
            if (stat.isDirectory()) {
              combinedOut += `${p}:\n${res.stdout}`;
            } else {
              combinedOut += res.stdout;
            }
          } catch {
            combinedOut += res.stdout;
          }
        }
        if (i < paths.length - 1 && combinedOut.endsWith('\n')) {
          combinedOut += '\n';
        }
      }

      return { stdout: combinedOut, stderr: combinedErr, exitCode: maxExit };
    },
  },
  {
    name: 'cd',
    description: 'Change working directory',
    usage: 'cd [dir]',
    manual: 'cd - Change the shell working directory to DIR. Default is $HOME.',
    execute: (args, context): ExecutionResult => {
      let target = args[0] || '~';
      if (target === '~') target = context.env.HOME || '/home/aether';
      if (target === '-') target = context.env.OLDPWD || context.cwd;

      const resolved = vfs.resolve(context.cwd, target);
      try {
        if (!vfs.exists(resolved)) {
          return { stdout: '', stderr: `cd: no such file or directory: ${target}\n`, exitCode: 1 };
        }
        const stat = vfs.stat(resolved);
        if (!stat.isDirectory()) {
          return { stdout: '', stderr: `cd: not a directory: ${target}\n`, exitCode: 1 };
        }
        context.env.OLDPWD = context.cwd;
        context.cwd = resolved;
        context.env.PWD = resolved;
        return { stdout: '', stderr: '', exitCode: 0 };
      } catch (err) {
        return { stdout: '', stderr: `cd: ${String(err)}\n`, exitCode: 1 };
      }
    },
  },
  {
    name: 'pwd',
    description: 'Print working directory',
    usage: 'pwd',
    execute: (_, context): ExecutionResult => {
      return { stdout: context.cwd + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'mkdir',
    description: 'Make directories',
    usage: 'mkdir [-p] <directory...>',
    execute: (args, context): ExecutionResult => {
      const recursive = args.includes('-p');
      const targets = args.filter((a) => a !== '-p');

      if (targets.length === 0) {
        return { stdout: '', stderr: 'mkdir: missing operand\n', exitCode: 1 };
      }

      for (const t of targets) {
        const resolved = vfs.resolve(context.cwd, t);
        try {
          vfs.mkdir(resolved, { recursive, owner: context.user });
        } catch (err) {
          return { stdout: '', stderr: `mkdir: cannot create directory '${t}': ${(err as Error).message}\n`, exitCode: 1 };
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'rmdir',
    description: 'Remove empty directories',
    usage: 'rmdir <directory...>',
    execute: (args, context): ExecutionResult => {
      if (args.length === 0) {
        return { stdout: '', stderr: 'rmdir: missing operand\n', exitCode: 1 };
      }
      for (const t of args) {
        const resolved = vfs.resolve(context.cwd, t);
        try {
          vfs.rmdir(resolved);
        } catch (err) {
          return { stdout: '', stderr: `rmdir: failed to remove '${t}': ${(err as Error).message}\n`, exitCode: 1 };
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'touch',
    description: 'Change file timestamps or create empty file',
    usage: 'touch <file...>',
    execute: (args, context): ExecutionResult => {
      if (args.length === 0) {
        return { stdout: '', stderr: 'touch: missing file operand\n', exitCode: 1 };
      }
      for (const t of args) {
        const resolved = vfs.resolve(context.cwd, t);
        if (vfs.exists(resolved)) {
          vfs.utimes(resolved);
        } else {
          vfs.writeFile(resolved, '', { owner: context.user });
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'cat',
    description: 'Concatenate files and print on standard output',
    usage: 'cat [file...]',
    execute: (args, context, stdin): ExecutionResult => {
      if (args.length === 0) {
        return { stdout: stdin, stderr: '', exitCode: 0 };
      }

      let out = '';
      for (const t of args) {
        if (t === '-') {
          out += stdin;
          continue;
        }
        const resolved = vfs.resolve(context.cwd, t);
        try {
          out += vfs.readFile(resolved);
        } catch {
          return { stdout: out, stderr: `cat: ${t}: No such file or directory\n`, exitCode: 1 };
        }
      }
      return { stdout: out, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'cp',
    description: 'Copy files and directories',
    usage: 'cp [-r|-R] <source...> <dest>',
    execute: (args, context): ExecutionResult => {
      const recursive = args.includes('-r') || args.includes('-R');
      const targets = args.filter((a) => !a.startsWith('-'));

      if (targets.length < 2) {
        return { stdout: '', stderr: 'cp: missing destination file operand\n', exitCode: 1 };
      }

      const dest = targets.pop()!;
      const resolvedDest = vfs.resolve(context.cwd, dest);
      const isDir = vfs.exists(resolvedDest) && vfs.stat(resolvedDest).isDirectory();

      if (targets.length > 1 && !isDir) {
        return { stdout: '', stderr: `cp: target '${dest}' is not a directory\n`, exitCode: 1 };
      }

      for (const src of targets) {
        const resolvedSrc = vfs.resolve(context.cwd, src);
        try {
          vfs.copy(resolvedSrc, resolvedDest, { recursive });
        } catch (err) {
          return { stdout: '', stderr: `cp: ${String(err)}\n`, exitCode: 1 };
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'mv',
    description: 'Move (rename) files',
    usage: 'mv <source...> <dest>',
    execute: (args, context): ExecutionResult => {
      const targets = args.filter((a) => !a.startsWith('-'));
      if (targets.length < 2) {
        return { stdout: '', stderr: 'mv: missing destination file operand\n', exitCode: 1 };
      }

      const dest = targets.pop()!;
      const baseDest = vfs.resolve(context.cwd, dest);
      const isDir = vfs.exists(baseDest) && vfs.stat(baseDest).isDirectory();

      if (targets.length > 1 && !isDir) {
        return { stdout: '', stderr: `mv: target '${dest}' is not a directory\n`, exitCode: 1 };
      }

      for (const src of targets) {
        const resolvedSrc = vfs.resolve(context.cwd, src);
        const srcName = resolvedSrc.split('/').pop()!;
        const curDest = isDir ? vfs.resolve(baseDest, srcName) : baseDest;
        try {
          vfs.rename(resolvedSrc, curDest);
        } catch (err) {
          return { stdout: '', stderr: `mv: ${String(err)}\n`, exitCode: 1 };
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'rm',
    description: 'Remove files or directories',
    usage: 'rm [-r|-f|-rf] <file...>',
    execute: (args, context): ExecutionResult => {
      const recursive = args.some((a) => a.includes('r') || a.includes('R'));
      const force = args.some((a) => a.includes('f'));
      const targets = args.filter((a) => !a.startsWith('-'));

      if (targets.length === 0) {
        if (force) return { stdout: '', stderr: '', exitCode: 0 };
        return { stdout: '', stderr: 'rm: missing operand\n', exitCode: 1 };
      }

      for (const t of targets) {
        const resolved = vfs.resolve(context.cwd, t);
        try {
          if (!vfs.exists(resolved)) {
            if (!force) {
              return { stdout: '', stderr: `rm: cannot remove '${t}': No such file or directory\n`, exitCode: 1 };
            }
            continue;
          }
          const stat = vfs.stat(resolved);
          if (stat.isDirectory()) {
            if (!recursive) {
              return { stdout: '', stderr: `rm: cannot remove '${t}': Is a directory\n`, exitCode: 1 };
            }
            vfs.rmdir(resolved, { recursive: true });
          } else {
            vfs.unlink(resolved);
          }
        } catch (err) {
          if (!force) {
            return { stdout: '', stderr: `rm: ${String(err)}\n`, exitCode: 1 };
          }
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'tree',
    description: 'List contents of directories in a tree-like format',
    usage: 'tree [path]',
    execute: (args, context): ExecutionResult => {
      const target = args[0] ? vfs.resolve(context.cwd, args[0]) : context.cwd;
      if (!vfs.exists(target)) {
        return { stdout: '', stderr: `tree: '${args[0]}': No such file or directory\n`, exitCode: 1 };
      }

      let dirsCount = 0;
      let filesCount = 0;
      const lines: string[] = [target];

      const walk = (dirPath: string, prefix = '') => {
        const entries = vfs.readdir(dirPath).filter((e) => !e.name.startsWith('.'));
        entries.forEach((e, idx) => {
          const isLast = idx === entries.length - 1;
          const branch = isLast ? '└── ' : '├── ';
          const nextPrefix = prefix + (isLast ? '    ' : '│   ');

          if (e.type === 'dir') {
            dirsCount++;
            lines.push(prefix + branch + `\x1b[1;34m${e.name}/\x1b[0m`);
            walk(e.path, nextPrefix);
          } else {
            filesCount++;
            lines.push(prefix + branch + e.name);
          }
        });
      };

      walk(target);
      lines.push(`\n${dirsCount} directories, ${filesCount} files`);
      return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'find',
    description: 'Search for files in a directory hierarchy',
    usage: 'find [path] [-name pattern] [-type f|d]',
    execute: (args, context): ExecutionResult => {
      let root = context.cwd;
      let namePattern: RegExp | null = null;
      let typeFilter: 'f' | 'd' | null = null;

      let i = 0;
      if (args[0] && !args[0].startsWith('-')) {
        root = vfs.resolve(context.cwd, args[0]);
        i++;
      }

      while (i < args.length) {
        if (args[i] === '-name' && i + 1 < args.length) {
          const pat = args[i + 1]
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
          namePattern = new RegExp('^' + pat + '$');
          i += 2;
        } else if (args[i] === '-type' && i + 1 < args.length) {
          typeFilter = args[i + 1] as 'f' | 'd';
          i += 2;
        } else {
          i++;
        }
      }

      const results: string[] = [];
      const walk = (dir: string) => {
        try {
          const entries = vfs.readdir(dir);
          for (const e of entries) {
            let match = true;
            if (namePattern && !namePattern.test(e.name)) match = false;
            if (typeFilter === 'f' && e.type !== 'file') match = false;
            if (typeFilter === 'd' && e.type !== 'dir') match = false;

            if (match) results.push(e.path);
            if (e.type === 'dir') {
              walk(e.path);
            }
          }
        } catch {}
      };

      if (vfs.exists(root)) {
        walk(root);
      }
      return { stdout: results.join('\n') + (results.length ? '\n' : ''), stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'grep',
    description: 'Print lines matching a pattern',
    usage: 'grep [-i] [-v] [-n] <pattern> [file...]',
    execute: (args, context, stdin): ExecutionResult => {
      let ignoreCase = false;
      let invert = false;
      let lineNumbers = false;
      const colorize = args.includes('--color') || args.includes('--color=always');
      const operands: string[] = [];

      for (const arg of args) {
        if (arg.startsWith('-')) {
          if (arg.includes('i')) ignoreCase = true;
          if (arg.includes('v')) invert = true;
          if (arg.includes('n')) lineNumbers = true;
        } else {
          operands.push(arg);
        }
      }

      if (operands.length === 0) {
        return { stdout: '', stderr: 'grep: missing pattern\n', exitCode: 2 };
      }

      const patternStr = operands[0];
      let regex: RegExp;
      let highlightRegex: RegExp;
      try {
        regex = new RegExp(patternStr, ignoreCase ? 'i' : '');
        highlightRegex = new RegExp(patternStr, ignoreCase ? 'gi' : 'g');
      } catch (e) {
        return { stdout: '', stderr: `grep: invalid regular expression: ${String(e)}\n`, exitCode: 2 };
      }
      const files = operands.slice(1);

      const processText = (text: string, prefix = ''): string[] => {
        const lines = text.split('\n');
        const matched: string[] = [];
        lines.forEach((line, idx) => {
          const matches = regex.test(line);
          const keep = invert ? !matches : matches;
          if (keep) {
            const numPart = lineNumbers ? `${idx + 1}:` : '';
            // Highlight match if not inverted and color enabled
            const formattedLine = invert || !colorize
              ? line
              : line.replace(highlightRegex, (m) => `\x1b[1;31m${m}\x1b[0m`);
            matched.push(`${prefix}${numPart}${formattedLine}`);
          }
        });
        return matched;
      };

      if (files.length === 0) {
        const res = processText(stdin);
        return { stdout: res.join('\n') + (res.length ? '\n' : ''), stderr: '', exitCode: res.length ? 0 : 1 };
      }

      const outLines: string[] = [];
      for (const f of files) {
        const resolved = vfs.resolve(context.cwd, f);
        try {
          const content = vfs.readFile(resolved);
          const prefix = files.length > 1 ? `${f}:` : '';
          outLines.push(...processText(content, prefix));
        } catch {
          return { stdout: '', stderr: `grep: ${f}: No such file or directory\n`, exitCode: 2 };
        }
      }

      return {
        stdout: outLines.join('\n') + (outLines.length ? '\n' : ''),
        stderr: '',
        exitCode: outLines.length > 0 ? 0 : 1,
      };
    },
  },
  {
    name: 'stat',
    description: 'Display file or file system status',
    usage: 'stat <file>',
    execute: (args, context): ExecutionResult => {
      if (args.length === 0) return { stdout: '', stderr: 'stat: missing operand\n', exitCode: 1 };
      const resolved = vfs.resolve(context.cwd, args[0]);
      try {
        const s = vfs.stat(resolved);
        const out = `  File: ${s.name}\n  Size: ${s.size}      Blocks: ${Math.ceil(s.size / 512)}   IO Block: 4096   ${s.type}\nDevice: 1h/1d   Inode: 423812     Links: 1\nAccess: (0${s.permissions.toString(8)}/${s.type === 'dir' ? 'd' : '-'}rwxr-xr-x)  Uid: ( 1000/  ${s.owner})   Gid: ( 1000/  ${s.group})\nModify: ${new Date(s.modifiedAt).toISOString()}\n`;
        return { stdout: out, stderr: '', exitCode: 0 };
      } catch {
        return { stdout: '', stderr: `stat: cannot stat '${args[0]}': No such file or directory\n`, exitCode: 1 };
      }
    },
  },
  {
    name: 'head',
    description: 'Output the first part of files',
    usage: 'head [-n lines] [file...]',
    execute: (args, context, stdin): ExecutionResult => {
      let count = 10;
      const files: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n' && i + 1 < args.length) {
          count = parseInt(args[i + 1], 10) || 10;
          i++;
        } else {
          files.push(args[i]);
        }
      }

      const getHead = (text: string) => text.split('\n').slice(0, count).join('\n') + '\n';

      if (files.length === 0) {
        return { stdout: getHead(stdin), stderr: '', exitCode: 0 };
      }

      let res = '';
      for (const f of files) {
        try {
          const content = vfs.readFile(vfs.resolve(context.cwd, f));
          if (files.length > 1) res += `==> ${f} <==\n`;
          res += getHead(content);
        } catch {
          return { stdout: '', stderr: `head: cannot open '${f}'\n`, exitCode: 1 };
        }
      }
      return { stdout: res, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'tail',
    description: 'Output the last part of files',
    usage: 'tail [-n lines] [file...]',
    execute: (args, context, stdin): ExecutionResult => {
      let count = 10;
      const files: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n' && i + 1 < args.length) {
          count = parseInt(args[i + 1], 10) || 10;
          i++;
        } else {
          files.push(args[i]);
        }
      }

      const getTail = (text: string) => {
        const lines = text.split('\n');
        return lines.slice(-count).join('\n') + '\n';
      };

      if (files.length === 0) {
        return { stdout: getTail(stdin), stderr: '', exitCode: 0 };
      }

      let res = '';
      for (const f of files) {
        try {
          const content = vfs.readFile(vfs.resolve(context.cwd, f));
          if (files.length > 1) res += `==> ${f} <==\n`;
          res += getTail(content);
        } catch {
          return { stdout: '', stderr: `tail: cannot open '${f}'\n`, exitCode: 1 };
        }
      }
      return { stdout: res, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'wc',
    description: 'Print newline, word, and byte counts for each file',
    usage: 'wc [-l] [-w] [-c] [file...]',
    execute: (args, context, stdin): ExecutionResult => {
      const files = args.filter((a) => !a.startsWith('-'));
      const showLines = args.includes('-l') || args.length === files.length;
      const showWords = args.includes('-w') || args.length === files.length;
      const showBytes = args.includes('-c') || args.length === files.length;

      const calc = (text: string) => {
        const lines = (text.match(/\n/g) || []).length;
        const words = (text.trim().match(/\S+/g) || []).length;
        const bytes = new TextEncoder().encode(text).length;
        return { lines, words, bytes };
      };

      if (files.length === 0) {
        const c = calc(stdin);
        const parts: string[] = [];
        if (showLines) parts.push(c.lines.toString());
        if (showWords) parts.push(c.words.toString());
        if (showBytes) parts.push(c.bytes.toString());
        return { stdout: `${parts.join(' ')}\n`, stderr: '', exitCode: 0 };
      }

      let res = '';
      for (const f of files) {
        try {
          const content = vfs.readFile(vfs.resolve(context.cwd, f));
          const c = calc(content);
          const parts: string[] = [];
          if (showLines) parts.push(c.lines.toString().padStart(4, ' '));
          if (showWords) parts.push(c.words.toString().padStart(4, ' '));
          if (showBytes) parts.push(c.bytes.toString().padStart(4, ' '));
          parts.push(f);
          res += parts.join(' ') + '\n';
        } catch {
          return { stdout: '', stderr: `wc: ${f}: No such file or directory\n`, exitCode: 1 };
        }
      }
      return { stdout: res, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'sort',
    description: 'Sort lines of text files',
    usage: 'sort [-r] [-n] [file...]',
    execute: (args, context, stdin): ExecutionResult => {
      const reverse = args.includes('-r');
      const numeric = args.includes('-n');
      const files = args.filter((a) => !a.startsWith('-'));

      let text = stdin;
      if (files.length > 0) {
        try {
          text = files.map((f) => vfs.readFile(vfs.resolve(context.cwd, f))).join('\n');
        } catch {
          return { stdout: '', stderr: 'sort: file open error\n', exitCode: 1 };
        }
      }

      const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
      lines.sort((a, b) => {
        if (numeric) {
          const na = parseFloat(a) || 0;
          const nb = parseFloat(b) || 0;
          return reverse ? nb - na : na - nb;
        }
        return reverse ? b.localeCompare(a) : a.localeCompare(b);
      });

      return { stdout: lines.join('\n') + (lines.length ? '\n' : ''), stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'uniq',
    description: 'Report or omit repeated lines',
    usage: 'uniq [-c] [file]',
    execute: (args, context, stdin): ExecutionResult => {
      const showCount = args.includes('-c');
      const files = args.filter((a) => !a.startsWith('-'));

      let text = stdin;
      if (files.length > 0) {
        try {
          text = vfs.readFile(vfs.resolve(context.cwd, files[0]));
        } catch {
          return { stdout: '', stderr: 'uniq: file open error\n', exitCode: 1 };
        }
      }

      const lines = text.split('\n').filter(Boolean);
      const res: string[] = [];
      let lastLine: string | null = null;
      let count = 0;

      for (const line of lines) {
        if (line === lastLine) {
          count++;
        } else {
          if (lastLine !== null) {
            res.push(showCount ? `${count.toString().padStart(4, ' ')} ${lastLine}` : lastLine);
          }
          lastLine = line;
          count = 1;
        }
      }
      if (lastLine !== null) {
        res.push(showCount ? `${count.toString().padStart(4, ' ')} ${lastLine}` : lastLine);
      }

      return { stdout: res.join('\n') + (res.length ? '\n' : ''), stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'df',
    description: 'Report file system disk space usage',
    usage: 'df [-h]',
    execute: (): ExecutionResult => {
      const out = `Filesystem     Type      Size  Used Avail Use% Mounted on\n/dev/vda1      ext4      2.0G  140M  1.8G   8% /\ntmpfs          tmpfs     512M  4.0K  512M   1% /tmp\nproc           proc         0     0     0    - /proc\n`;
      return { stdout: out, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'du',
    description: 'Estimate file space usage',
    usage: 'du [-h] [-s] [path...]',
    execute: (args, context): ExecutionResult => {
      const target = args[0] ? vfs.resolve(context.cwd, args[0]) : context.cwd;
      try {
        const stats = vfs.stat(target);
        return { stdout: `${Math.ceil(stats.size / 1024)}K\t${target}\n`, stderr: '', exitCode: 0 };
      } catch {
        return { stdout: '', stderr: `du: cannot access '${target}'\n`, exitCode: 1 };
      }
    },
  },
  {
    name: 'chmod',
    description: 'Change file mode bits',
    usage: 'chmod <mode> <file...>',
    execute: (args, context): ExecutionResult => {
      if (args.length < 2) return { stdout: '', stderr: 'chmod: missing operand\n', exitCode: 1 };
      const mode = parseInt(args[0], 8);
      for (const f of args.slice(1)) {
        try {
          vfs.chmod(vfs.resolve(context.cwd, f), mode);
        } catch (err) {
          return { stdout: '', stderr: `chmod: ${String(err)}\n`, exitCode: 1 };
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'chown',
    description: 'Change file owner and group',
    usage: 'chown <owner>[:<group>] <file...>',
    execute: (args, context): ExecutionResult => {
      if (args.length < 2) return { stdout: '', stderr: 'chown: missing operand\n', exitCode: 1 };
      const [owner, group] = args[0].split(':');
      for (const f of args.slice(1)) {
        try {
          vfs.chown(vfs.resolve(context.cwd, f), owner, group);
        } catch (err) {
          return { stdout: '', stderr: `chown: ${String(err)}\n`, exitCode: 1 };
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
];
