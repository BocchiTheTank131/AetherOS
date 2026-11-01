// AetherOS - Data & Developer Utilities Shell Commands
import type { RegisteredCommand, ExecutionResult } from '../types';
import { vfs } from '../../vfs/vfs';
import { aetherRuntime } from '../../runtime/AetherRuntime';

// Real RFC 1321 MD5 calculation
export function computeMd5(str: string): string {
  function safeAdd(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num: number, cnt: number) {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 128) utf8.push(code);
    else if (code < 2048) utf8.push((code >> 6) | 192, (code & 63) | 128);
    else if (code < 65536) utf8.push((code >> 12) | 224, ((code >> 6) & 63) | 128, (code & 63) | 128);
    else utf8.push((code >> 18) | 240, ((code >> 12) & 63) | 128, ((code >> 6) & 63) | 128, (code & 63) | 128);
  }

  const n = utf8.length;
  const words: number[] = [];
  for (let i = 0; i < n; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (utf8[i] << ((i % 4) * 8));
  }
  words[n >> 2] = (words[n >> 2] || 0) | (0x80 << ((n % 4) * 8));
  const totalLen = (((n + 8) >> 6) + 1) * 16;
  while (words.length < totalLen) words.push(0);
  words[totalLen - 2] = (n * 8) & 0xffffffff;
  words[totalLen - 1] = Math.floor((n * 8) / 0x100000000);

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < words.length; i += 16) {
    const olda = a, oldb = b, oldc = c, oldd = d;

    a = md5ff(a, b, c, d, words[i], 7, -680876936);
    d = md5ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = md5ff(c, d, a, b, words[i + 2], 17, 606105819);
    b = md5ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = md5ff(a, b, c, d, words[i + 4], 7, -176418897);
    d = md5ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = md5ff(c, d, a, b, words[i + 6], 17, -1473231341);
    b = md5ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = md5ff(a, b, c, d, words[i + 8], 7, 1770035416);
    d = md5ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = md5ff(c, d, a, b, words[i + 10], 17, -42063);
    b = md5ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = md5ff(a, b, c, d, words[i + 12], 7, 1804603682);
    d = md5ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = md5ff(c, d, a, b, words[i + 14], 17, -1502002290);
    b = md5ff(b, c, d, a, words[i + 15], 22, 1236535329);

    a = md5gg(a, b, c, d, words[i + 1], 5, -165796510);
    d = md5gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = md5gg(c, d, a, b, words[i + 11], 14, 643717713);
    b = md5gg(b, c, d, a, words[i], 20, -373897302);
    a = md5gg(a, b, c, d, words[i + 5], 5, -701558691);
    d = md5gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = md5gg(c, d, a, b, words[i + 15], 14, -660478335);
    b = md5gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = md5gg(a, b, c, d, words[i + 9], 5, 568446438);
    d = md5gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = md5gg(c, d, a, b, words[i + 3], 14, -187363961);
    b = md5gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = md5gg(a, b, c, d, words[i + 13], 5, -1444681467);
    d = md5gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = md5gg(c, d, a, b, words[i + 7], 14, 1735328473);
    b = md5gg(b, c, d, a, words[i + 12], 20, -1926607734);

    a = md5hh(a, b, c, d, words[i + 5], 4, -378558);
    d = md5hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = md5hh(c, d, a, b, words[i + 11], 16, 1839030562);
    b = md5hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = md5hh(a, b, c, d, words[i + 1], 4, -1530992060);
    d = md5hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = md5hh(c, d, a, b, words[i + 7], 16, -155497632);
    b = md5hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = md5hh(a, b, c, d, words[i + 13], 4, 681279174);
    d = md5hh(d, a, b, c, words[i], 11, -358537222);
    c = md5hh(c, d, a, b, words[i + 3], 16, -722521979);
    b = md5hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = md5hh(a, b, c, d, words[i + 9], 4, -640364487);
    d = md5hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = md5hh(c, d, a, b, words[i + 15], 16, 530742520);
    b = md5hh(b, c, d, a, words[i + 2], 23, -995338651);

    a = md5ii(a, b, c, d, words[i], 6, -198630844);
    d = md5ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = md5ii(c, d, a, b, words[i + 14], 15, -1416354905);
    b = md5ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = md5ii(a, b, c, d, words[i + 12], 6, 1700485571);
    d = md5ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = md5ii(c, d, a, b, words[i + 10], 15, -1051523);
    b = md5ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = md5ii(a, b, c, d, words[i + 8], 6, 1873313359);
    d = md5ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = md5ii(c, d, a, b, words[i + 6], 15, -1560198380);
    b = md5ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = md5ii(a, b, c, d, words[i + 4], 6, -145523070);
    d = md5ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = md5ii(c, d, a, b, words[i + 2], 15, 718787259);
    b = md5ii(b, c, d, a, words[i + 9], 21, -343485551);

    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  const hexChars = '0123456789abcdef';
  let res = '';
  for (const val of [a, b, c, d]) {
    for (let j = 0; j < 4; j++) {
      const byte = (val >> (j * 8)) & 255;
      res += hexChars.charAt((byte >> 4) & 15) + hexChars.charAt(byte & 15);
    }
  }
  return res;
}

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
    description: 'Compute MD5 checksum',
    usage: 'md5sum [file...]',
    execute: (args, context, stdin): ExecutionResult => {
      if (args.length === 0) {
        return { stdout: `${computeMd5(stdin)}  -\n`, stderr: '', exitCode: 0 };
      }

      let out = '';
      for (const f of args) {
        try {
          const content = vfs.readFile(vfs.resolve(context.cwd, f));
          out += `${computeMd5(content)}  ${f}\n`;
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
    description: 'Execute JavaScript code in secure isolated runtime',
    usage: 'js [file | -e code]',
    execute: async (args, context, stdin): Promise<ExecutionResult> => {
      let code = stdin;
      let scriptName = 'eval';
      if (args[0] === '-e' && args[1]) {
        code = args.slice(1).join(' ');
      } else if (args[0]) {
        scriptName = args[0];
        try {
          code = vfs.readFile(vfs.resolve(context.cwd, args[0]));
        } catch {
          return { stdout: '', stderr: `js: cannot open '${args[0]}'\n`, exitCode: 1 };
        }
      }

      if (!code.trim()) {
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      const res = await aetherRuntime.execute(code, {
        commandName: `js ${scriptName}`,
        args: args.slice(1),
      });

      return {
        stdout: res.stdout,
        stderr: res.stderr,
        exitCode: res.exitCode,
      };
    },
  },
  {
    name: 'node',
    description: 'AetherOS JavaScript Runtime (Node.js compatibility notice)',
    usage: 'node [-v] [file | -e code]',
    execute: async (args, context, stdin): Promise<ExecutionResult> => {
      if (args[0] === '-v' || args[0] === '--version') {
        return {
          stdout:
            'v20.12.0 (aether-runtime shim)\nNote: Native Node.js C++ bindings and built-ins (\'fs\', \'child_process\', \'http\') are unavailable in browser. Use \'aether.fs\' API.\n',
          stderr: '',
          exitCode: 0,
        };
      }

      if (args.length === 0 && !stdin.trim()) {
        return {
          stdout:
            'AetherOS JavaScript Runtime (v1.2.0)\nNote: Native Node.js C++ bindings and built-ins (fs, child_process, http) are unavailable in browser environment.\nTo execute JavaScript, use "js <file.js>" or "js -e <code>".\nVirtual filesystem access is available through the "aether.fs" API.\n',
          stderr: '',
          exitCode: 0,
        };
      }

      const jsCmd = devCommands.find((c) => c.name === 'js')!;
      const res = await jsCmd.execute(args, context, stdin);
      const notice = '[aether-node] Notice: Running in browser sandbox via Aether Runtime. Native Node.js C++ bindings are unavailable.\n';
      return {
        stdout: notice + res.stdout,
        stderr: res.stderr,
        exitCode: res.exitCode,
      };
    },
  },
];
