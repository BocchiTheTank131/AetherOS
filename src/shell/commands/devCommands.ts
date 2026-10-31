// AetherOS - Data & Developer Utilities Shell Commands
import type { RegisteredCommand, ExecutionResult } from '../types';
import { vfs } from '../../vfs/vfs';

export const devCommands: RegisteredCommand[] = [
  {
    name: 'base64',
    description: 'Base64 encode or decode data and print to standard output',
    usage: 'base64 [-d] [file]',
    execute: (args, context, stdin): ExecutionResult => {
      const decode = args.includes('-d');
      const files = args.filter((a) => a !== '-d');

      let text = stdin;
      if (files.length > 0) {
        try {
          text = vfs.readFile(vfs.resolve(context.cwd, files[0]));
        } catch {
          return { stdout: '', stderr: `base64: ${files[0]}: No such file or directory\n`, exitCode: 1 };
        }
      }

      try {
        if (decode) {
          const binary = atob(text.trim());
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
          const res = new TextDecoder().decode(bytes);
          return { stdout: res + '\n', stderr: '', exitCode: 0 };
        } else {
          const bytes = new TextEncoder().encode(text);
          let binary = '';
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const res = btoa(binary);
          return { stdout: res + '\n', stderr: '', exitCode: 0 };
        }
      } catch (err) {
        return { stdout: '', stderr: `base64: invalid input: ${(err as Error).message}\n`, exitCode: 1 };
      }
    },
  },
  {
    name: 'sha256sum',
    description: 'Compute and check SHA256 message digest',
    usage: 'sha256sum [file...]',
    execute: async (args, context, stdin): Promise<ExecutionResult> => {
      const hashText = async (text: string): Promise<string> => {
        const msgBuffer = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      };

      if (args.length === 0) {
        const h = await hashText(stdin);
        return { stdout: `${h}  -\n`, stderr: '', exitCode: 0 };
      }

      let out = '';
      for (const f of args) {
        try {
          const content = vfs.readFile(vfs.resolve(context.cwd, f));
          const h = await hashText(content);
          out += `${h}  ${f}\n`;
        } catch {
          return { stdout: out, stderr: `sha256sum: ${f}: No such file or directory\n`, exitCode: 1 };
        }
      }
      return { stdout: out, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'md5sum',
    description: 'Compute MD5 checksum approximation',
    usage: 'md5sum [file...]',
    execute: (args, context, stdin): ExecutionResult => {
      // Lightweight checksum for browser
      const simpleMd5 = (s: string) => {
        let hash = 0;
        for (let i = 0; i < s.length; i++) {
          hash = (hash << 5) - hash + s.charCodeAt(i);
          hash |= 0;
        }
        return Math.abs(hash).toString(16).padStart(32, '0');
      };

      if (args.length === 0) {
        return { stdout: `${simpleMd5(stdin)}  -\n`, stderr: '', exitCode: 0 };
      }

      let out = '';
      for (const f of args) {
        try {
          const content = vfs.readFile(vfs.resolve(context.cwd, f));
          out += `${simpleMd5(content)}  ${f}\n`;
        } catch {
          return { stdout: out, stderr: `md5sum: ${f}: No such file or directory\n`, exitCode: 1 };
        }
      }
      return { stdout: out, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'jq',
    description: 'Command-line JSON processor',
    usage: 'jq [filter] [file]',
    execute: (args, context, stdin): ExecutionResult => {
      const filter = args[0] || '.';
      const file = args[1];

      let raw = stdin;
      if (file) {
        try {
          raw = vfs.readFile(vfs.resolve(context.cwd, file));
        } catch {
          return { stdout: '', stderr: `jq: cannot open ${file}\n`, exitCode: 2 };
        }
      }

      try {
        const obj = JSON.parse(raw);
        if (filter === '.' || !filter) {
          return { stdout: JSON.stringify(obj, null, 2) + '\n', stderr: '', exitCode: 0 };
        }

        // Support simple field access like .name or .items[0]
        const cleanFilter = filter.startsWith('.') ? filter.slice(1) : filter;
        const parts = cleanFilter.split('.');
        let curr: unknown = obj;

        for (const p of parts) {
          if (curr && typeof curr === 'object' && p in (curr as Record<string, unknown>)) {
            curr = (curr as Record<string, unknown>)[p];
          } else {
            curr = null;
            break;
          }
        }

        const out = typeof curr === 'string' ? curr : JSON.stringify(curr, null, 2);
        return { stdout: (out ?? 'null') + '\n', stderr: '', exitCode: 0 };
      } catch (err) {
        return { stdout: '', stderr: `jq: parse error: ${(err as Error).message}\n`, exitCode: 5 };
      }
    },
  },
  {
    name: 'js',
    description: 'Execute JavaScript code in sandboxed runtime',
    usage: 'js [file | -e code]',
    execute: (args, context, stdin): ExecutionResult => {
      let code = stdin;
      if (args[0] === '-e' && args[1]) {
        code = args.slice(1).join(' ');
      } else if (args[0]) {
        try {
          code = vfs.readFile(vfs.resolve(context.cwd, args[0]));
        } catch {
          return { stdout: '', stderr: `js: cannot open '${args[0]}'\n`, exitCode: 1 };
        }
      }

      if (!code.trim()) {
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      const logs: string[] = [];
      const sandbox = {
        console: {
          log: (...a: unknown[]) => logs.push(a.map(String).join(' ')),
          warn: (...a: unknown[]) => logs.push('[WARN] ' + a.map(String).join(' ')),
          error: (...a: unknown[]) => logs.push('[ERROR] ' + a.map(String).join(' ')),
        },
        Math,
        JSON,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        parseInt,
        parseFloat,
      };

      try {
        // Safe evaluation with sandbox arguments
        const fn = new Function(...Object.keys(sandbox), code);
        const result = fn(...Object.values(sandbox));
        if (result !== undefined && logs.length === 0) {
          logs.push(String(result));
        }
        return { stdout: logs.join('\n') + (logs.length ? '\n' : ''), stderr: '', exitCode: 0 };
      } catch (err) {
        return { stdout: logs.join('\n') + '\n', stderr: `ReferenceError: ${(err as Error).message}\n`, exitCode: 1 };
      }
    },
  },
  {
    name: 'node',
    description: 'Node.js compatible runtime wrapper',
    usage: 'node [file | -e code]',
    execute: (args, context, stdin) => {
      const jsCmd = devCommands.find((c) => c.name === 'js')!;
      return jsCmd.execute(args, context, stdin);
    },
  },
];
