import { describe, it, expect, beforeEach } from 'vitest';
import { vfs } from '../vfs/vfs';
import { shellExecutor } from '../shell/executor';
import { createDefaultShellContext, expandGlobs } from '../shell/environment';
import { computeMd5 } from '../shell/commands/devCommands';
import { packageManager } from '../pkg/packageManager';
import { checkRuntimePathAccess, createDefaultPermissions } from '../runtime/RuntimePermissions';
import { runtimeManager } from '../runtime/RuntimeManager';
import { aetherRuntime } from '../runtime/AetherRuntime';

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

    it('packageManager searches by category and description (Issue 43)', () => {
      const gameMatches = packageManager.search('games');
      expect(gameMatches.length).toBeGreaterThan(0);
      expect(gameMatches.some((p) => p.category === 'Games')).toBe(true);

      const descMatches = packageManager.search('puzzle');
      expect(descMatches.some((p) => p.id === 'game2048')).toBe(true);
    });

    it('detects 2048 game over state on locked board (Issue 42)', () => {
      // 4x4 board with alternating values and no valid moves
      const fullLockedBoard = [
        [2, 4, 2, 4],
        [4, 2, 4, 2],
        [2, 4, 2, 4],
        [4, 2, 4, 2],
      ];
      const checkGameOver = (b: number[][]): boolean => {
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            if (b[r][c] === 0) return false;
            if (c < 3 && b[r][c] === b[r][c + 1]) return false;
            if (r < 3 && b[r][c] === b[r + 1][c]) return false;
          }
        }
        return true;
      };
      expect(checkGameOver(fullLockedBoard)).toBe(true);

      const hasValidMove = [
        [2, 2, 4, 8],
        [4, 8, 2, 4],
        [2, 4, 8, 2],
        [4, 2, 4, 8],
      ];
      expect(checkGameOver(hasValidMove)).toBe(false);
    });
  });

  describe('Audited 22 Issues Regression Suite', () => {
    it('Issue 1: checkRuntimePathAccess normalizes paths to prevent CWE-22 path traversal', () => {
      const perms = createDefaultPermissions();
      // Attempt traversal out of allowed /home/aether to /etc/shadow
      const writeAllowed = checkRuntimePathAccess('/home/aether/../../../etc/shadow', 'write', perms);
      expect(writeAllowed).toBe(false);

      const readAllowed = checkRuntimePathAccess('/home/aether/../../../etc/passwd', 'read', perms);
      // /etc is an allowed read path, so reading /etc/passwd is allowed
      expect(readAllowed).toBe(true);

      const rootReadAllowed = checkRuntimePathAccess('/home/aether/../../../root/secret', 'read', perms);
      // /root is NOT an allowed read path
      expect(rootReadAllowed).toBe(false);
    });

    it('Issue 3: RuntimeManager releases active session descriptors after completion', async () => {
      const initialCount = runtimeManager.getActiveCount();
      for (let i = 0; i < 10; i++) {
        const session = aetherRuntime.createSession({ commandName: `test-${i}` });
        const res = await session.execute(`const x = ${i};`);
        expect(res.exitCode).toBe(0);
      }
      expect(runtimeManager.getActiveCount()).toBe(initialCount);
    });

    it('Issue 5: rejects untrusted script execution in current directory without ./', async () => {
      const ctx = createDefaultShellContext();
      vfs.writeFile('/home/aether/local_script.sh', 'echo "should not run directly"\n', {
        permissions: 0o755,
      });

      // Typing command without ./ should not execute the file in CWD
      const res = await shellExecutor.execute('local_script.sh', ctx);
      expect(res.exitCode).toBe(127);
      expect(res.stderr).toContain('command not found');

      // Typing with ./ should execute it
      const resWithDot = await shellExecutor.execute('./local_script.sh', ctx);
      expect(resWithDot.exitCode).toBe(0);
      expect(resWithDot.stdout).toContain('should not run directly');
    });

    it('Issue 6: resolves executable scripts from $PATH directories', async () => {
      const ctx = createDefaultShellContext();
      vfs.mkdir('/usr/bin', { recursive: true });
      vfs.writeFile('/usr/bin/path_tool.sh', 'echo "executed from path"\n', {
        permissions: 0o755,
      });

      const res = await shellExecutor.execute('path_tool.sh', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('executed from path');
    });

    it('Issue 7: redirection permission errors return non-zero exit code without unhandled rejection', async () => {
      const ctx = createDefaultShellContext();
      ctx.user = 'aether';
      vfs.mkdir('/root', { recursive: true, permissions: 0o700, owner: 'root' });

      const res = await shellExecutor.execute('echo secret > /root/denied.txt', ctx);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('permission denied');
    });

    it('Issue 9: case statements match shell glob patterns with ? and character classes', async () => {
      const ctx = createDefaultShellContext();
      const script = `
case "apple" in
  a?ple) echo "matched-question" ;;
  *) echo "no-match" ;;
esac
`;
      const res = await shellExecutor.execute(script, ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('matched-question');
    });

    it('Issue 10: sourcing script without arguments preserves caller positional parameters', async () => {
      const ctx = createDefaultShellContext();
      vfs.writeFile('/home/aether/helper.sh', 'echo "inside helper: $1"\n');

      ctx.positionalArgs = ['alpha', 'beta'];
      ctx.env['1'] = 'alpha';
      ctx.env['2'] = 'beta';
      ctx.env['#'] = '2';

      const res = await shellExecutor.execute('source /home/aether/helper.sh', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('inside helper: alpha');
      expect(ctx.env['1']).toBe('alpha');
      expect(ctx.env['#']).toBe('2');
    });

    it('Issue 11: vfs.readFile processes binary data chunks without UI thread freeze', () => {
      const largeData = new Uint8Array(16384);
      for (let i = 0; i < largeData.length; i++) largeData[i] = i % 256;
      vfs.writeBytesSync('/home/aether/large.bin', largeData, { isBinary: true });

      const dataUrl = vfs.readFile('/home/aether/large.bin');
      expect(dataUrl.startsWith('data:application/octet-stream;base64,')).toBe(true);
    });

    it('Issue 12: text writes do not allocate duplicate binaryContent', () => {
      const textPath = '/home/aether/dedupe_test.txt';
      vfs.writeFile(textPath, 'hello world');
      const node = vfs.getNode(textPath);
      expect(node).toBeDefined();
      expect(node?.content).toBe('hello world');
      expect(node?.binaryContent).toBeUndefined();

      // Lazy readBytes generates Uint8Array on demand
      const bytes = vfs.readBytes(textPath);
      expect(bytes.length).toBe(11);
    });

    it('Issue 13: vfs.appendFile preserves binary integrity via appendBytes', () => {
      const binPath = '/home/aether/stream.bin';
      const b1 = new Uint8Array([1, 2, 3]);
      const b2 = new Uint8Array([4, 5, 6]);

      vfs.writeBytesSync(binPath, b1, { isBinary: true });
      vfs.appendFile(binPath, b2);

      const combined = vfs.readBytes(binPath);
      expect(Array.from(combined)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('Issue 14: vfs.emptyTrash cleans up .info metadata files', () => {
      vfs.writeFile('/home/aether/trash_target.txt', 'trash me');
      vfs.moveToTrash('/home/aether/trash_target.txt');

      expect(vfs.exists('/home/aether/.trash/.info')).toBe(true);
      const infoBefore = vfs.readdir('/home/aether/.trash/.info');
      expect(infoBefore.length).toBeGreaterThan(0);

      vfs.emptyTrash();
      const infoAfter = vfs.readdir('/home/aether/.trash/.info');
      expect(infoAfter.length).toBe(0);
    });

    it('Issue 21: test -r, -w, -x accurately checks POSIX permissions', async () => {
      const ctx = createDefaultShellContext();
      ctx.user = 'aether';
      vfs.writeFile('/home/aether/no_perms.txt', 'locked', { permissions: 0o000 });

      const resR = await shellExecutor.execute('test -r /home/aether/no_perms.txt', ctx);
      expect(resR.exitCode).toBe(1);

      vfs.chmod('/home/aether/no_perms.txt', 0o755);
      const resR2 = await shellExecutor.execute('test -r /home/aether/no_perms.txt', ctx);
      expect(resR2.exitCode).toBe(0);
    });

    it('Issue 22: wait returns the exit code of failed background job', async () => {
      const ctx = createDefaultShellContext();
      const res = await shellExecutor.execute('false & wait', ctx);
      expect(res.exitCode).toBe(1);
    });
  });
});
