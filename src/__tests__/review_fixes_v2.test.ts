import { describe, it, expect, beforeEach } from 'vitest';
import { vfs } from '../vfs/vfs';
import { shellExecutor } from '../shell/executor';
import { createDefaultShellContext, expandGlobs } from '../shell/environment';
import { computeMd5 } from '../shell/commands/devCommands';

describe('Code Review V2 Bug Fixes Verification', () => {
  beforeEach(async () => {
    await vfs.init();
  });

  describe('Subsystem 1: VFS & Storage Hardening', () => {
    it('vfs.copy throws EINVAL when copying directory into itself or descendant (Issue 1)', () => {
      vfs.mkdir('/home/aether/src_dir', { recursive: true });
      expect(() => {
        vfs.copy('/home/aether/src_dir', '/home/aether/src_dir/sub', { recursive: true });
      }).toThrow(/EINVAL/);
    });

    it('vfs.rename throws EINVAL when moving directory into its own descendant (Issue 2)', () => {
      vfs.mkdir('/home/aether/parent_dir', { recursive: true });
      vfs.mkdir('/home/aether/parent_dir/child', { recursive: true });
      expect(() => {
        vfs.rename('/home/aether/parent_dir', '/home/aether/parent_dir/child/sub');
      }).toThrow(/EINVAL/);
    });

    it('vfs.getNode throws ELOOP when detecting circular symlinks (Issue 3)', () => {
      vfs.symlink('/home/aether/linkB', '/home/aether/linkA');
      vfs.symlink('/home/aether/linkA', '/home/aether/linkB');
      expect(() => {
        vfs.getNode('/home/aether/linkA');
      }).toThrow(/ELOOP/);
    });

    it('/dev dynamic node directory exists and is synthesized (Issue 4)', () => {
      expect(vfs.exists('/dev')).toBe(true);
      const stat = vfs.stat('/dev');
      expect(stat.isDirectory()).toBe(true);
      const entries = vfs.readdir('/dev');
      expect(entries.map((e) => e.name)).toContain('null');
      expect(entries.map((e) => e.name)).toContain('urandom');
    });

    it('vfs.utimes updates modifiedAt timestamp on files (Issue 19)', () => {
      const p = '/home/aether/touch_test.txt';
      vfs.writeFile(p, 'sample');
      const customTime = 1600000000000;
      vfs.utimes(p, customTime);
      const stat = vfs.stat(p);
      expect(stat.modifiedAt).toBe(customTime);
    });

    it('vfs.moveToTrash stores metadata and vfs.restoreFromTrash restores to origin (Issue 25)', () => {
      const testPath = '/home/aether/Documents/original.txt';
      vfs.writeFile(testPath, 'precious content');
      const trashDest = vfs.moveToTrash(testPath);

      expect(vfs.exists(testPath)).toBe(false);
      expect(vfs.exists(trashDest)).toBe(true);

      vfs.restoreFromTrash(trashDest);
      expect(vfs.exists(testPath)).toBe(true);
      expect(vfs.readFile(testPath)).toBe('precious content');
    });
  });

  describe('Subsystem 2 & 3: aesh Shell & Utilities Hardening', () => {
    it('cp fails with error when multiple sources are given and target is not a directory (Issue 10)', async () => {
      const ctx = createDefaultShellContext();
      vfs.writeFile('/home/aether/s1.txt', '1');
      vfs.writeFile('/home/aether/s2.txt', '2');
      vfs.writeFile('/home/aether/non_dir.txt', 'target');

      const res = await shellExecutor.execute('cp s1.txt s2.txt non_dir.txt', ctx);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("cp: target 'non_dir.txt' is not a directory");
    });

    it('grep with --color outputs ANSI codes, and plain grep does not (Issue 11)', async () => {
      const ctx = createDefaultShellContext();
      vfs.writeFile('/home/aether/sample.txt', 'hello world\nfoo bar\n');

      const plainRes = await shellExecutor.execute('grep world sample.txt', ctx);
      expect(plainRes.exitCode).toBe(0);
      expect(plainRes.stdout).toBe('hello world\n');
      expect(plainRes.stdout).not.toContain('\x1b[');

      const colorRes = await shellExecutor.execute('grep --color world sample.txt', ctx);
      expect(colorRes.exitCode).toBe(0);
      expect(colorRes.stdout).toContain('\x1b[1;31mworld\x1b[0m');
    });

    it('sort preserves empty lines instead of filtering them out (Issue 27)', async () => {
      const ctx = createDefaultShellContext();
      vfs.writeFile('/home/aether/sort_input.txt', 'b\n\na\n');

      const res = await shellExecutor.execute('sort sort_input.txt', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('\na\nb\n');
    });

    it('computeMd5 computes accurate RFC 1321 MD5 hashes (Issue 14)', () => {
      expect(computeMd5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
      expect(computeMd5('The quick brown fox jumps over the lazy dog')).toBe(
        '9e107d9d372bb6826bd81d3542a419d6'
      );
    });

    it('shell parser throws syntax error on trailing or dangling redirection operator (Issue 20)', async () => {
      const ctx = createDefaultShellContext();
      const res = await shellExecutor.execute('echo hello >', ctx);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('syntax error near unexpected token');
    });

    it('expandGlobs wildcard does not match dotfiles unless pattern starts with dot (Issue 22)', () => {
      vfs.mkdir('/home/aether/dot_test', { recursive: true });
      vfs.writeFile('/home/aether/dot_test/normal.txt', '');
      vfs.writeFile('/home/aether/dot_test/.hidden', '');

      const wildcardMatches = expandGlobs('*', '/home/aether/dot_test');
      expect(wildcardMatches).toContain('normal.txt');
      expect(wildcardMatches).not.toContain('.hidden');

      const dotMatches = expandGlobs('.*', '/home/aether/dot_test');
      expect(dotMatches).toContain('.hidden');
    });

    it('seq handles sequences up to limit without silent truncation (Issue 37)', async () => {
      const ctx = createDefaultShellContext();
      const res = await shellExecutor.execute('seq 1 1500', ctx);
      expect(res.exitCode).toBe(0);
      const lines = res.stdout.trim().split('\n');
      expect(lines.length).toBe(1500);
      expect(lines[0]).toBe('1');
      expect(lines[1499]).toBe('1500');
    });
  });
});
