// AetherOS - Network Shell Utilities
import type { RegisteredCommand, ExecutionResult } from '../types';
import { vfs } from '../../vfs/vfs';

export const netCommands: RegisteredCommand[] = [
  {
    name: 'ping',
    description: 'Send ICMP ECHO_REQUEST to network hosts (HTTP reachability approximation in browser)',
    usage: 'ping [-c count] <host>',
    execute: async (args): Promise<ExecutionResult> => {
      let count = 4;
      let host = '';

      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-c' && i + 1 < args.length) {
          count = parseInt(args[i + 1], 10) || 4;
          i++;
        } else if (!args[i].startsWith('-')) {
          host = args[i];
        }
      }

      if (!host) {
        return { stdout: '', stderr: 'ping: missing host operand\n', exitCode: 1 };
      }

      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === 'aetheros';
      const lines = [
        `PING ${host} (${isLocal ? '127.0.0.1' : host}): 56 data bytes [HTTP-Reachability Mode]`,
      ];
      let receivedCount = 0;

      for (let seq = 1; seq <= count; seq++) {
        const start = performance.now();
        if (isLocal) {
          await new Promise((r) => setTimeout(r, 8 + Math.random() * 5));
          const time = (performance.now() - start).toFixed(2);
          lines.push(`64 bytes from 127.0.0.1: icmp_seq=${seq} ttl=64 time=${time} ms`);
          receivedCount++;
        } else {
          try {
            const url = host.startsWith('http') ? host : `https://${host}`;
            await fetch(url, { method: 'HEAD', mode: 'no-cors' });
            const time = (performance.now() - start).toFixed(2);
            lines.push(`64 bytes from ${host}: icmp_seq=${seq} ttl=56 time=${time} ms`);
            receivedCount++;
          } catch {
            lines.push(`Request timeout for icmp_seq ${seq}`);
          }
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      const lossPct = count > 0 ? Math.round(((count - receivedCount) / count) * 100) : 0;
      lines.push(`--- ${host} ping statistics ---`);
      lines.push(`${count} packets transmitted, ${receivedCount} received, ${lossPct}% packet loss`);
      return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: receivedCount > 0 ? 0 : 1 };
    },
  },
  {
    name: 'curl',
    description: 'Transfer a URL',
    usage: 'curl [-s] [-o file] <url>',
    execute: async (args, context): Promise<ExecutionResult> => {
      let outputTarget: string | null = null;
      let url = '';

      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-o' && i + 1 < args.length) {
          outputTarget = args[i + 1];
          i++;
        } else if (!args[i].startsWith('-')) {
          url = args[i];
        }
      }

      if (!url) {
        return { stdout: '', stderr: 'curl: try \'curl --help\' for more information\n', exitCode: 2 };
      }

      try {
        const targetUrl = url.startsWith('http') ? url : `https://${url}`;
        const res = await fetch(targetUrl);
        const text = await res.text();

        if (outputTarget) {
          const dest = vfs.resolve(context.cwd, outputTarget);
          vfs.writeFile(dest, text, { owner: context.user });
          return { stdout: `Saved ${new TextEncoder().encode(text).length} bytes to ${outputTarget}\n`, stderr: '', exitCode: 0 };
        }

        return { stdout: text + '\n', stderr: '', exitCode: 0 };
      } catch (err) {
        return {
          stdout: '',
          stderr: `curl: (6) Could not resolve host or blocked by browser CORS: ${(err as Error).message}\n`,
          exitCode: 6,
        };
      }
    },
  },
  {
    name: 'wget',
    description: 'The non-interactive network downloader',
    usage: 'wget [-O file] <url>',
    execute: async (args, context): Promise<ExecutionResult> => {
      let filename: string | null = null;
      let url = '';

      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-O' && i + 1 < args.length) {
          filename = args[i + 1];
          i++;
        } else if (!args[i].startsWith('-')) {
          url = args[i];
        }
      }

      if (!url) {
        return { stdout: '', stderr: 'wget: missing URL\n', exitCode: 1 };
      }

      try {
        const targetUrl = url.startsWith('http') ? url : `https://${url}`;
        const inferredName = filename || targetUrl.split('/').pop() || 'download.html';
        const dest = vfs.resolve(context.cwd, inferredName);

        const res = await fetch(targetUrl);
        const text = await res.text();
        vfs.writeFile(dest, text, { owner: context.user });

        const bytes = new TextEncoder().encode(text).length;
        const out = `--2026-10-31 12:00:00--  ${targetUrl}\nResolving ${targetUrl}...\nConnecting... connected.\nHTTP request sent, awaiting response... ${res.status} ${res.statusText}\nLength: ${bytes} (${(bytes / 1024).toFixed(1)}K)\nSaving to: '${inferredName}'\n\n100%[======================================>] ${bytes}  --.-KB/s    in 0.05s\n\n2026-10-31 12:00:00 (${(bytes / 1024 / 0.05).toFixed(1)} KB/s) - '${inferredName}' saved [${bytes}/${bytes}]\n`;

        return { stdout: out, stderr: '', exitCode: 0 };
      } catch (err) {
        return { stdout: '', stderr: `wget: error connecting to ${url}: ${(err as Error).message}\n`, exitCode: 1 };
      }
    },
  },
];
