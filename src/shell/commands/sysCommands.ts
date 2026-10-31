// AetherOS - System & Process Shell Commands
import type { RegisteredCommand, ExecutionResult } from '../types';
import { virtualKernel } from '../../core/kernel';
import { systemLogger } from '../../core/logger';
import { systemEventBus } from '../../core/eventBus';

export const sysCommands: RegisteredCommand[] = [
  {
    name: 'ps',
    description: 'Report a snapshot of the current processes',
    usage: 'ps [-ef] [aux]',
    execute: (args): ExecutionResult => {
      const procs = virtualKernel.getProcesses();
      const long = args.some((a) => a.includes('u') || a.includes('f') || a.includes('e'));

      if (long) {
        const header = 'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND';
        const lines = [header];
        for (const p of procs) {
          const u = p.user.padEnd(8, ' ');
          const pid = p.pid.toString().padStart(5, ' ');
          const cpu = p.cpuPercent.toFixed(1).padStart(4, ' ');
          const mem = ((p.memoryKb / (1024 * 1024)) * 100).toFixed(1).padStart(4, ' ');
          const vsz = p.memoryKb.toString().padStart(6, ' ');
          const rss = Math.floor(p.memoryKb * 0.7).toString().padStart(5, ' ');
          const stat = p.state === 'running' ? 'S+' : 'T';
          const start = new Date(p.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const cmd = p.args.length > 0 ? `${p.command} ${p.args.join(' ')}` : p.command;

          lines.push(`${u} ${pid} ${cpu} ${mem} ${vsz} ${rss} pts/0    ${stat.padEnd(4, ' ')} ${start}   0:00 ${cmd}`);
        }
        return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
      }

      const header = '  PID TTY          TIME CMD';
      const lines = [header];
      for (const p of procs) {
        lines.push(`${p.pid.toString().padStart(5, ' ')} pts/0    00:00:00 ${p.name}`);
      }
      return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'top',
    description: 'Display Linux processes and system resources',
    usage: 'top',
    execute: (): ExecutionResult => {
      const up = virtualKernel.getFormattedUptime();
      const procs = virtualKernel.getProcesses();
      const mem = virtualKernel.getTotalMemoryUsage();
      const avgCpu = virtualKernel.getAverageCpuUsage();

      const out = [
        `\x1b[1;36mtop - ${new Date().toLocaleTimeString()} up ${up},  1 user,  load average: 0.14, 0.18, 0.12\x1b[0m`,
        `Tasks: \x1b[1m${procs.length}\x1b[0m total, \x1b[1;32m${procs.filter((p) => p.state === 'running').length}\x1b[0m running, \x1b[1m${procs.filter((p) => p.state === 'stopped').length}\x1b[0m stopped, 0 zombie`,
        `%Cpu(s): \x1b[1m${avgCpu}\x1b[0m us, \x1b[1m0.4\x1b[0m sy, \x1b[1m0.0\x1b[0m ni, \x1b[1m${(100 - avgCpu - 0.4).toFixed(1)}\x1b[0m id, \x1b[1m0.0\x1b[0m wa`,
        `MiB Mem : \x1b[1m${Math.round(mem.totalKb / 1024)}\x1b[0m total, \x1b[1m${Math.round((mem.totalKb - mem.usedKb) / 1024)}\x1b[0m free, \x1b[1m${Math.round(mem.usedKb / 1024)}\x1b[0m used`,
        '',
        '\x1b[7m  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND          \x1b[0m',
        ...procs.slice(0, 12).map((p) => {
          const pid = p.pid.toString().padStart(5, ' ');
          const user = p.user.padEnd(8, ' ');
          const virt = p.memoryKb.toString().padStart(7, ' ');
          const res = Math.floor(p.memoryKb * 0.7).toString().padStart(6, ' ');
          const cpu = p.cpuPercent.toFixed(1).padStart(5, ' ');
          const memP = ((p.memoryKb / (1024 * 1024)) * 100).toFixed(1).padStart(5, ' ');
          return `${pid} ${user}  20   0 ${virt} ${res}   4096 S ${cpu} ${memP}   0:00.12 ${p.name}`;
        }),
      ];
      return { stdout: out.join('\n') + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'htop',
    description: 'Interactive process viewer (snapshot mode)',
    usage: 'htop',
    execute: (): ExecutionResult => {
      const procs = virtualKernel.getProcesses();
      const mem = virtualKernel.getTotalMemoryUsage();
      const cpu = virtualKernel.getAverageCpuUsage();
      const cpuBars = Math.round((cpu / 100) * 25);
      const memBars = Math.round((mem.percent / 100) * 25);

      const bar1 = '|'.repeat(cpuBars).padEnd(25, ' ');
      const barMem = '|'.repeat(memBars).padEnd(25, ' ');

      const out = [
        `\x1b[1;32m1  [${bar1} ${cpu.toFixed(1)}%]\x1b[0m`,
        `\x1b[1;34mMem[${barMem} ${Math.round(mem.usedKb / 1024)}M/${Math.round(mem.totalKb / 1024)}M]\x1b[0m`,
        `\x1b[1;36mTasks: ${procs.length}, 1 thr; 1 running\x1b[0m`,
        '',
        '\x1b[7m  PID USER      PRI  NI  VIRT   RES   SHR S CPU% MEM%   TIME+  Command             \x1b[0m',
        ...procs.map((p) => {
          const pid = p.pid.toString().padStart(5, ' ');
          const user = p.user.padEnd(8, ' ');
          const virt = (p.memoryKb + 'K').padStart(6, ' ');
          const res = (Math.floor(p.memoryKb * 0.7) + 'K').padStart(5, ' ');
          const cpuS = p.cpuPercent.toFixed(1).padStart(4, ' ');
          const memS = ((p.memoryKb / (1024 * 1024)) * 100).toFixed(1).padStart(4, ' ');
          return `${pid} ${user}   20   0 ${virt} ${res}  4.0M S  ${cpuS} ${memS}  0:00.08 ${p.name}`;
        }),
      ];
      return { stdout: out.join('\n') + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'kill',
    description: 'Send a signal to a process',
    usage: 'kill [-9|-15] <pid...>',
    execute: (args): ExecutionResult => {
      let signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM';
      const pids: number[] = [];

      for (const a of args) {
        if (a === '-9' || a === '-KILL') signal = 'SIGKILL';
        else if (a === '-15' || a === '-TERM') signal = 'SIGTERM';
        else {
          const num = parseInt(a, 10);
          if (!isNaN(num)) pids.push(num);
        }
      }

      if (pids.length === 0) {
        return { stdout: '', stderr: 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ...\n', exitCode: 1 };
      }

      let err = '';
      for (const pid of pids) {
        const ok = virtualKernel.kill(pid, signal);
        if (!ok) {
          err += `kill: (${pid}) - No such process\n`;
        }
      }

      return { stdout: '', stderr: err, exitCode: err ? 1 : 0 };
    },
  },
  {
    name: 'killall',
    description: 'Kill processes by name',
    usage: 'killall <name>',
    execute: (args): ExecutionResult => {
      if (args.length === 0) {
        return { stdout: '', stderr: 'killall: missing process name\n', exitCode: 1 };
      }
      const count = virtualKernel.killAll(args[0]);
      if (count === 0) {
        return { stdout: '', stderr: `killall: ${args[0]}: no process found\n`, exitCode: 1 };
      }
      return { stdout: `Terminated ${count} process(es)\n`, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'uptime',
    description: 'Tell how long the system has been running',
    usage: 'uptime',
    execute: (): ExecutionResult => {
      const up = virtualKernel.getFormattedUptime();
      return {
        stdout: ` ${new Date().toLocaleTimeString()} up ${up},  1 user,  load average: 0.12, 0.15, 0.11\n`,
        stderr: '',
        exitCode: 0,
      };
    },
  },
  {
    name: 'whoami',
    description: 'Print effective userid',
    usage: 'whoami',
    execute: (_, context): ExecutionResult => {
      return { stdout: context.user + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'id',
    description: 'Print user and group information',
    usage: 'id',
    execute: (_, context): ExecutionResult => {
      const uid = context.user === 'root' ? 0 : 1000;
      const gid = context.user === 'root' ? 0 : 1000;
      return {
        stdout: `uid=${uid}(${context.user}) gid=${gid}(${context.user}) groups=${gid}(${context.user}),27(sudo),100(users)\n`,
        stderr: '',
        exitCode: 0,
      };
    },
  },
  {
    name: 'uname',
    description: 'Print system information',
    usage: 'uname [-a] [-r] [-s] [-m]',
    execute: (args): ExecutionResult => {
      const all = args.includes('-a');
      if (all) {
        return {
          stdout: 'Linux aetheros 6.8.0-aether #1 SMP PREEMPT_DYNAMIC Sat Oct 31 2026 x86_64 GNU/Linux\n',
          stderr: '',
          exitCode: 0,
        };
      }
      if (args.includes('-r')) return { stdout: '6.8.0-aether\n', stderr: '', exitCode: 0 };
      if (args.includes('-m')) return { stdout: 'x86_64\n', stderr: '', exitCode: 0 };
      return { stdout: 'Linux\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'hostname',
    description: 'Show or set the system host name',
    usage: 'hostname',
    execute: (_, context): ExecutionResult => {
      return { stdout: context.hostname + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'free',
    description: 'Display amount of free and used memory in the system',
    usage: 'free [-h] [-m]',
    execute: (): ExecutionResult => {
      const mem = virtualKernel.getTotalMemoryUsage();
      const totalMb = Math.round(mem.totalKb / 1024);
      const usedMb = Math.round(mem.usedKb / 1024);
      const freeMb = totalMb - usedMb;

      const out = `               total        used        free      shared  buff/cache   available\nMem:           ${totalMb}Mi       ${usedMb}Mi       ${freeMb}Mi        16Mi        64Mi       ${freeMb}Mi\nSwap:              0B          0B          0B\n`;
      return { stdout: out, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'fastfetch',
    description: 'Fast, highly customizable system information tool',
    usage: 'fastfetch',
    execute: (): ExecutionResult => {
      const up = virtualKernel.getFormattedUptime();
      const procs = virtualKernel.getProcesses().length;
      const mem = virtualKernel.getTotalMemoryUsage();

      const logo = [
        '  \x1b[1;36m      /\\      \x1b[0m',
        '  \x1b[1;36m     /  \\     \x1b[0m',
        '  \x1b[1;36m    / /\\ \\    \x1b[0m',
        '  \x1b[1;34m   / ____ \\   \x1b[0m',
        '  \x1b[1;34m  /_/    \\_\\  \x1b[0m',
        '  \x1b[1;35m  A E T H E R \x1b[0m',
      ];

      const info = [
        '\x1b[1;36maether@aetheros\x1b[0m',
        '\x1b[1;30m--------------\x1b[0m',
        '\x1b[1;36mOS:\x1b[0m AetherOS 1.0 LTS (Quantum Breeze) x86_64',
        '\x1b[1;36mHost:\x1b[0m Browser Virtual Machine (HTML5/Wasm)',
        '\x1b[1;36mKernel:\x1b[0m 6.8.0-aether (AetherCore)',
        `\x1b[1;36mUptime:\x1b[0m ${up}`,
        `\x1b[1;36mProcesses:\x1b[0m ${procs} (virtual kernel)`,
        '\x1b[1;36mShell:\x1b[0m aesh 1.0 (Aether Shell)',
        '\x1b[1;36mDisplay:\x1b[0m 1920x1080 @ 60Hz',
        '\x1b[1;36mDE:\x1b[0m Aether Desktop (Modern Linux Compositor)',
        '\x1b[1;36mWM:\x1b[0m AetherWM',
        '\x1b[1;36mTheme:\x1b[0m Obsidian Glass [Dark]',
        '\x1b[1;36mIcons:\x1b[0m Lucide Modern Linux',
        '\x1b[1;36mTerminal:\x1b[0m Aether Terminal',
        '\x1b[1;36mCPU:\x1b[0m Virtual Core (Multi-Threaded WebWorker)',
        `\x1b[1;36mMemory:\x1b[0m ${Math.round(mem.usedKb / 1024)}MiB / ${Math.round(mem.totalKb / 1024)}MiB (${mem.percent}%)`,
        '',
        '  \x1b[40m   \x1b[41m   \x1b[42m   \x1b[43m   \x1b[44m   \x1b[45m   \x1b[46m   \x1b[47m   \x1b[0m',
      ];

      const maxLen = Math.max(logo.length, info.length);
      const out: string[] = [];
      for (let i = 0; i < maxLen; i++) {
        const left = logo[i] || '                ';
        const right = info[i] || '';
        out.push(`${left.padEnd(20, ' ')} ${right}`);
      }

      return { stdout: out.join('\n') + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'neofetch',
    description: 'CLI system information tool',
    usage: 'neofetch',
    execute: (args, context, stdin) => {
      // Alias to fastfetch
      const ff = sysCommands.find((c) => c.name === 'fastfetch')!;
      return ff.execute(args, context, stdin);
    },
  },
  {
    name: 'dmesg',
    description: 'Print or control the kernel ring buffer',
    usage: 'dmesg',
    execute: (): ExecutionResult => {
      const logs = systemLogger.formatDmesg();
      return { stdout: logs.join('\n') + (logs.length ? '\n' : ''), stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'journalctl',
    description: 'Query the systemd journal',
    usage: 'journalctl [-u service] [-n count]',
    execute: (args): ExecutionResult => {
      let count = 50;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n' && i + 1 < args.length) {
          count = parseInt(args[i + 1], 10) || 50;
        }
      }
      const logs = systemLogger.formatJournal().slice(-count);
      return { stdout: logs.join('\n') + (logs.length ? '\n' : ''), stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'reboot',
    description: 'Reboot the virtual system',
    usage: 'reboot',
    execute: (): ExecutionResult => {
      systemLogger.info('system', 'Virtual system reboot initiated by user command');
      setTimeout(() => {
        systemEventBus.emit('system:restart', { timestamp: Date.now() });
      }, 500);
      return { stdout: 'Broadcast message from root@aetheros: System is rebooting now!\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'shutdown',
    description: 'Halt, power-off or reboot the machine',
    usage: 'shutdown [-h] [now]',
    execute: (): ExecutionResult => {
      systemLogger.info('system', 'Virtual system shutdown initiated by user command');
      setTimeout(() => {
        systemEventBus.emit('system:shutdown', { timestamp: Date.now() });
      }, 500);
      return { stdout: 'Broadcast message from root@aetheros: System is powering down now!\n', stderr: '', exitCode: 0 };
    },
  },
];
