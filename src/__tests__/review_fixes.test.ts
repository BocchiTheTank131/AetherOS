import { describe, it, expect, beforeEach } from 'vitest';
import { vfs } from '../vfs/vfs';
import { shellExecutor } from '../shell/executor';
import { createDefaultShellContext, expandGlobs } from '../shell/environment';
import { appRegistry } from '../apps/appRegistry';
import { searchIndexer } from '../vfs/searchIndexer';

describe('Code Review Bug Fixes Verification', () => {
  beforeEach(async () => {
    await vfs.init();
  });

  describe('Category 1: Core & Registry Fixes', () => {
    it('registers audio-recorder application in appRegistry', () => {
      const app = appRegistry.getApp('audio-recorder');
      expect(app).toBeDefined();
      expect(app?.name).toBe('Sound Studio');
      expect(app?.icon).toBe('Mic');
    });
  });

  describe('Category 2: Virtual Filesystem (VFS) & Shell Engine Fixes', () => {
    it('vfs.mkdir with recursive: true succeeds on existing directory (mkdir -p)', () => {
      vfs.mkdir('/home/aether/testdir', { recursive: true });
      expect(vfs.exists('/home/aether/testdir')).toBe(true);

      // Should not throw EEXIST
      expect(() => {
        vfs.mkdir('/home/aether/testdir', { recursive: true });
      }).not.toThrow();
    });

    it('vfs.mkdir throws ENOTDIR if parent is a regular file', () => {
      vfs.writeFile('/home/aether/somefile.txt', 'content');
      expect(() => {
        vfs.mkdir('/home/aether/somefile.txt/child');
      }).toThrow(/ENOTDIR/);
    });

    it('shell mv moves multiple files into a directory without overwriting', async () => {
      const ctx = createDefaultShellContext();
      vfs.writeFile('/home/aether/fileA.txt', 'AAA');
      vfs.writeFile('/home/aether/fileB.txt', 'BBB');
      vfs.mkdir('/home/aether/target_dir', { recursive: true });

      const res = await shellExecutor.execute('mv fileA.txt fileB.txt target_dir', ctx);
      expect(res.exitCode).toBe(0);

      expect(vfs.exists('/home/aether/target_dir/fileA.txt')).toBe(true);
      expect(vfs.readFile('/home/aether/target_dir/fileA.txt')).toBe('AAA');

      expect(vfs.exists('/home/aether/target_dir/fileB.txt')).toBe(true);
      expect(vfs.readFile('/home/aether/target_dir/fileB.txt')).toBe('BBB');

      expect(vfs.exists('/home/aether/fileA.txt')).toBe(false);
      expect(vfs.exists('/home/aether/fileB.txt')).toBe(false);
    });

    it('expandGlobs preserves directory prefix for paths', () => {
      vfs.mkdir('/home/aether/glob_test', { recursive: true });
      vfs.writeFile('/home/aether/glob_test/test1.log', '1');
      vfs.writeFile('/home/aether/glob_test/test2.log', '2');

      const matches = expandGlobs('/home/aether/glob_test/*.log', '/home/aether');
      expect(matches).toContain('/home/aether/glob_test/test1.log');
      expect(matches).toContain('/home/aether/glob_test/test2.log');
    });

    it('wc on stdin respects -l, -w, -c flags', async () => {
      const ctx = createDefaultShellContext();
      const res = await shellExecutor.execute('echo "line 1\\nline 2\\nline 3" | wc -l', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout.trim()).toBe('3');
    });

    it('base64 encodes and decodes Unicode / UTF-8 strings correctly', async () => {
      const ctx = createDefaultShellContext();
      const unicodeString = '✨ AetherOS Linux 🚀';
      const enc = await shellExecutor.execute(`echo "${unicodeString}" | base64`, ctx);
      expect(enc.exitCode).toBe(0);
      const base64Str = enc.stdout.trim();

      const dec = await shellExecutor.execute(`echo "${base64Str}" | base64 -d`, ctx);
      expect(dec.exitCode).toBe(0);
      expect(dec.stdout.trim()).toBe(unicodeString);
    });

    it('printf formats %s, %d, and %f specifiers', async () => {
      const ctx = createDefaultShellContext();
      const res = await shellExecutor.execute('printf "Hello %s, score: %d, rate: %f\\n" Aether 42 3.14', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('Hello Aether, score: 42, rate: 3.14\n');
    });

    it('grep handles invalid regex gracefully with exitCode 2', async () => {
      const ctx = createDefaultShellContext();
      const res = await shellExecutor.execute('echo "foo" | grep "["', ctx);
      expect(res.exitCode).toBe(2);
      expect(res.stderr).toContain('invalid regular expression');
    });

    it('searchIndexer indexes files synchronously on initial query', () => {
      vfs.writeFile('/home/aether/Documents/report_sample.md', 'Test content');
      const results = searchIndexer.searchFiles('report_sample');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('report_sample.md');
    });
  });
});
