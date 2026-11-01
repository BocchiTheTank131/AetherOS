// AetherOS v1.2.0: Real Computing - Subsystem Test Suite
import { describe, it, expect, beforeEach } from 'vitest';
import { vfs } from '../vfs/vfs';
import { shellExecutor } from '../shell/executor';
import { virtualKernel } from '../core/kernel';
import { performanceService } from '../core/performanceService';
import { AETHER_VERSION } from '../core/version';
import { aetherRuntime } from '../runtime/AetherRuntime';
import type { ShellContext } from '../shell/types';

function createMockContext(overrides?: Partial<ShellContext>): ShellContext {
  return {
    cwd: '/home/aether',
    env: {
      HOME: '/home/aether',
      USER: 'aether',
      PATH: '/bin:/usr/bin',
      SHELL: '/bin/aesh',
      HOSTNAME: 'aetheros',
      '?': '0',
    },
    aliases: {},
    history: [],
    exitCode: 0,
    user: 'aether',
    hostname: 'aetheros',
    jobs: new Map(),
    ...overrides,
  };
}

describe('AetherOS v1.2.0: Real Computing', () => {
  beforeEach(async () => {
    await vfs.init();
    if (!vfs.exists('/home/aether')) {
      vfs.mkdir('/home/aether', { recursive: true });
    }
  });

  describe('Objective B: AetherFS 2.0 (Binary Safety, POSIX Access, Symlinks & Backup)', () => {
    it('stores and retrieves binary data intact using Uint8Array (readBytes/writeBytes)', () => {
      const filePath = '/home/aether/test.bin';
      const rawBytes = new Uint8Array([0x00, 0xff, 0x41, 0x42, 0x00, 0xfe, 0x7f, 0x80]);

      vfs.writeBytes(filePath, rawBytes, { owner: 'aether', group: 'aether', permissions: 0o644 });

      expect(vfs.exists(filePath)).toBe(true);
      const stat = vfs.stat(filePath);
      expect(stat.size).toBe(8);

      const retrieved = vfs.readBytes(filePath);
      expect(retrieved.length).toBe(8);
      expect(Array.from(retrieved)).toEqual(Array.from(rawBytes));
    });

    it('enforces POSIX access control rules (checkAccess & directory traversal)', () => {
      const secretFile = '/home/aether/secret.key';
      vfs.writeFile(secretFile, 'supersecret', { owner: 'root', group: 'root', permissions: 0o600 });

      // Root context should pass
      expect(vfs.checkAccess(secretFile, 4, { user: 'root', groups: ['root'] })).toBe(true);

      // Non-root context should fail read check
      expect(vfs.checkAccess(secretFile, 4, { user: 'aether', groups: ['aether'] })).toBe(false);

      // Directory traversal check
      const lockedDir = '/home/aether/locked';
      vfs.mkdir(lockedDir, { owner: 'root', group: 'root', permissions: 0o600 });
      const insideFile = '/home/aether/locked/file.txt';
      vfs.writeFile(insideFile, 'hello', { owner: 'aether', group: 'aether', permissions: 0o644 });

      // 'aether' lacks execute (+x) on /home/aether/locked
      expect(vfs.checkAccess(insideFile, 4, { user: 'aether', groups: ['aether'] })).toBe(false);
    });

    it('distinguishes symbolic links with lstat and resolves relative symlinks', () => {
      const target = '/home/aether/target.txt';
      const link = '/home/aether/link.txt';
      vfs.writeFile(target, 'target content');
      vfs.symlink('target.txt', link); // Relative symlink

      // lstat returns symlink node itself
      const lstatRes = vfs.lstat(link);
      expect(lstatRes.isSymbolicLink()).toBe(true);
      expect(lstatRes.isFile()).toBe(false);

      // stat follows symlink to target
      const statRes = vfs.stat(link);
      expect(statRes.isFile()).toBe(true);
      expect(vfs.readFile(link)).toBe('target content');
    });

    it('creates and restores versioned system backups with SHA-256 verification', async () => {
      const markerPath = '/home/aether/backup_test.txt';
      vfs.writeFile(markerPath, 'backup verification content');

      const backup = await vfs.createBackup();
      expect(backup.version).toBe(2);
      expect(backup.filesCount).toBeGreaterThan(0);
      expect(backup.checksum).toBeTruthy();

      // Modify marker
      vfs.writeFile(markerPath, 'modified content');
      expect(vfs.readFile(markerPath)).toBe('modified content');

      // Restore from backup
      const restored = await vfs.restoreBackup(backup);
      expect(restored).toBe(true);
      expect(vfs.readFile(markerPath)).toBe('backup verification content');
    });
  });

  describe('Objective A: Secure Aether Runtime', () => {
    it('executes JavaScript code in isolated runtime and captures stdout', async () => {
      const code = `
        const a = 10;
        const b = 25;
        console.log("Result:", a + b);
      `;
      const res = await aetherRuntime.execute(code);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Result: 35');
    });

    it('provides guest globalThis.aether.fs API access within the runtime', async () => {
      const testFile = '/home/aether/runtime_fs_test.txt';
      vfs.writeFile(testFile, 'Hello from VFS');

      const code = `
        if (typeof globalThis.aether !== 'undefined' && globalThis.aether.fs) {
          const exists = globalThis.aether.fs.exists('/home/aether/runtime_fs_test.txt');
          const content = globalThis.aether.fs.readText('/home/aether/runtime_fs_test.txt');
          console.log('FS_TEST:', exists, content);
        }
      `;
      const res = await aetherRuntime.execute(code);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('FS_TEST: true Hello from VFS');
    });

    it('handles runtime timeouts with exit code 124', async () => {
      // Infinite loop with 100ms timeout
      const code = `
        const start = Date.now();
        while (Date.now() - start < 1000) {}
      `;
      const res = await aetherRuntime.execute(code, { timeoutMs: 100 });
      expect(res.exitCode).toBe(124);
      expect(res.stderr).toContain('timed out');
    });
  });

  describe('Objective C: Advanced aesh POSIX Scripting & Job Control', () => {
    it('evaluates test and [ ] expressions accurately', async () => {
      const ctx = createMockContext();
      vfs.writeFile('/home/aether/file.txt', 'data');
      vfs.mkdir('/home/aether/dir', { recursive: true });

      // -f file
      let res = await shellExecutor.execute('[ -f /home/aether/file.txt ]', ctx);
      expect(res.exitCode).toBe(0);

      // -d dir
      res = await shellExecutor.execute('[ -d /home/aether/dir ]', ctx);
      expect(res.exitCode).toBe(0);

      // -f dir should fail
      res = await shellExecutor.execute('[ -f /home/aether/dir ]', ctx);
      expect(res.exitCode).toBe(1);

      // Missing ] syntax error
      res = await shellExecutor.execute('[ -f /home/aether/file.txt', ctx);
      expect(res.exitCode).toBe(2);
      expect(res.stderr).toContain("missing ']'");

      // String comparison
      res = await shellExecutor.execute('test "abc" = "abc"', ctx);
      expect(res.exitCode).toBe(0);
      res = await shellExecutor.execute('test "abc" != "xyz"', ctx);
      expect(res.exitCode).toBe(0);

      // Numeric comparison
      res = await shellExecutor.execute('[ 10 -gt 5 ]', ctx);
      expect(res.exitCode).toBe(0);
      res = await shellExecutor.execute('[ 5 -ge 10 ]', ctx);
      expect(res.exitCode).toBe(1);
    });

    it('executes if-then-elif-else-fi conditional constructs', async () => {
      const ctx = createMockContext();
      const script = `
        VAL=hello
        if [ "$VAL" = "world" ]; then
          echo "matched world"
        elif [ "$VAL" = "hello" ]; then
          echo "matched hello"
        else
          echo "no match"
        fi
      `;
      const res = await shellExecutor.execute(script, ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout.trim()).toBe('matched hello');
    });

    it('executes for loops with item lists and variable expansion', async () => {
      const ctx = createMockContext();
      const script = `
        for num in 1 2 3; do
          echo "Item $num"
        done
      `;
      const res = await shellExecutor.execute(script, ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Item 1\nItem 2\nItem 3');
    });

    it('executes while loops with conditional termination', async () => {
      const ctx = createMockContext();
      const script = `
        COUNT=0
        while [ "$COUNT" -lt 3 ]; do
          echo "Loop $COUNT"
          if [ "$COUNT" -eq 0 ]; then
            COUNT=1
          elif [ "$COUNT" -eq 1 ]; then
            COUNT=2
          else
            COUNT=3
          fi
        done
      `;
      const res = await shellExecutor.execute(script, ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Loop 0\nLoop 1\nLoop 2');
    });

    it('executes case-esac statements with pattern matching', async () => {
      const ctx = createMockContext();
      const script = `
        OS=linux
        case "$OS" in
          windows) echo "MS Windows" ;;
          linux|unix) echo "Unix-like OS" ;;
          *) echo "Unknown" ;;
        esac
      `;
      const res = await shellExecutor.execute(script, ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout.trim()).toBe('Unix-like OS');
    });

    it('defines and invokes shell functions with positional parameters ($1..$9, $#, $@)', async () => {
      const ctx = createMockContext();
      const script = `
        greet() {
          echo "Args count: $#"
          echo "First: $1, Second: $2"
          echo "All: $@"
        }
        greet Alice Bob
      `;
      const res = await shellExecutor.execute(script, ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Args count: 2');
      expect(res.stdout).toContain('First: Alice, Second: Bob');
      expect(res.stdout).toContain('All: Alice Bob');
    });

    it('manages background jobs (&, jobs, wait)', async () => {
      const ctx = createMockContext();
      // Execute command with &
      const spawnRes = await shellExecutor.execute('echo "background done" &', ctx);
      expect(spawnRes.exitCode).toBe(0);
      expect(spawnRes.stdout).toMatch(/\[\d+\] \d+/);
      expect(ctx.jobs?.size).toBeGreaterThan(0);

      // jobs command should list it
      const jobsRes = await shellExecutor.execute('jobs', ctx);
      expect(jobsRes.exitCode).toBe(0);
      expect(jobsRes.stdout).toContain('background done');

      // wait command completes jobs
      const waitRes = await shellExecutor.execute('wait', ctx);
      expect(waitRes.exitCode).toBe(0);
    });

    it('executes shell scripts (.sh) with shebang and arguments', async () => {
      const ctx = createMockContext();
      const scriptPath = '/home/aether/test.sh';
      const content = `#!/bin/aesh
        echo "Script: $0"
        echo "Hello $1"
      `;
      vfs.writeFile(scriptPath, content);

      const res = await shellExecutor.execute('./test.sh World', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Script: /home/aether/test.sh');
      expect(res.stdout).toContain('Hello World');
    });
  });

  describe('Objective D: Honest Telemetry & Kernel Metrics', () => {
    it('returns honest network ping output with HTTP reachability diagnostics', async () => {
      const ctx = createMockContext();
      const res = await shellExecutor.execute('ping -c 1 example.com', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('PING example.com');
      expect(res.stdout).toContain('HTTP reachability');
    });

    it('provides honest memory metrics in free command with source notes', async () => {
      const ctx = createMockContext();
      const res = await shellExecutor.execute('free', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Mem:');
      expect(res.stdout).toContain('Memory telemetry source:');
    });

    it('calculates virtualKernel metrics without Math.random fabrication', () => {
      const mem = virtualKernel.getTotalMemoryUsage();
      expect(mem.usedKb).toBeGreaterThan(0);
      expect(mem.totalKb).toBeGreaterThan(0);
      expect(mem.percent).toBeGreaterThan(0);
      expect(mem.source).toMatch(/performance\.memory|virtual_heap/);

      const cpu = virtualKernel.getAverageCpuUsage();
      expect(cpu).toBeGreaterThanOrEqual(0.0);
    });

    it('synthesizes dynamic /proc/<pid>/status and cmdline for active processes', () => {
      expect(vfs.exists('/proc/1')).toBe(true);
      expect(vfs.exists('/proc/1/status')).toBe(true);
      expect(vfs.exists('/proc/1/cmdline')).toBe(true);

      const status = vfs.readFile('/proc/1/status');
      expect(status).toContain('Name:\tsystemd');
      expect(status).toContain('Pid:\t1');
      expect(status).toContain('State:\tR (running)');

      const cmdline = vfs.readFile('/proc/1/cmdline');
      expect(cmdline).toContain('/sbin/init');

      const procEntries = vfs.readdir('/proc');
      expect(procEntries.some((e) => e.name === '1' && e.type === 'dir')).toBe(true);

      const pid1Entries = vfs.readdir('/proc/1');
      expect(pid1Entries.some((e) => e.name === 'status')).toBe(true);
      expect(pid1Entries.some((e) => e.name === 'cmdline')).toBe(true);
    });

    it('collects real performance samples via performanceService and supports measureTask', async () => {
      const sample = performanceService.getCurrentSample();
      expect(sample.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(sample.totalMemoryKb).toBeGreaterThan(0);
      expect(sample.activeProcesses).toBeGreaterThanOrEqual(3);

      let notified = false;
      const unsub = performanceService.subscribe((s) => {
        if (s.activeProcesses > 0) notified = true;
      });
      expect(notified).toBe(true);
      unsub();

      const measured = await performanceService.measureTask('test_computation', 'task', () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });
      expect(measured.result).toBe(499500);
      expect(measured.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('enforces centralized version consistency across AETHER_VERSION', () => {
      expect(AETHER_VERSION.version).toBe('1.4.0');
      expect(AETHER_VERSION.codename).toBe('Developer Workstation');
      expect(vfs.readFile('/proc/version')).toContain('1.4.0');
      expect(vfs.readFile('/etc/os-release')).toContain('VERSION_ID="1.4.0"');
    });
  });
});
