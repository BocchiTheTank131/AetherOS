import { describe, it, expect, beforeEach } from 'vitest';
import { vfs } from '../vfs/vfs';
import { shellExecutor } from '../shell/executor';
import { createDefaultShellContext } from '../shell/environment';
import { virtualKernel } from '../core/kernel';
import { audioService } from '../core/audio';

describe('AetherOS v1.1 Quality & Polish Overhaul Suite', () => {
  beforeEach(async () => {
    await vfs.init();
  });

  describe('Shell `seq` command behavior', () => {
    it('executes seq with single argument (seq 5)', async () => {
      const ctx = createDefaultShellContext();
      const res = await shellExecutor.execute('seq 5', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('1\n2\n3\n4\n5\n');
    });

    it('executes seq with range (seq 3 6)', async () => {
      const ctx = createDefaultShellContext();
      const res = await shellExecutor.execute('seq 3 6', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('3\n4\n5\n6\n');
    });

    it('executes seq with step (seq 1 2 7)', async () => {
      const ctx = createDefaultShellContext();
      const res = await shellExecutor.execute('seq 1 2 7', ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('1\n3\n5\n7\n');
    });

    it('returns error when seq argument is missing or invalid', async () => {
      const ctx = createDefaultShellContext();
      const resMissing = await shellExecutor.execute('seq', ctx);
      expect(resMissing.exitCode).toBe(1);
      expect(resMissing.stderr).toContain('missing operand');

      const resInvalid = await shellExecutor.execute('seq abc', ctx);
      expect(resInvalid.exitCode).toBe(1);
      expect(resInvalid.stderr).toContain('invalid argument');
    });
  });

  describe('VFS Trash and Restore Operations', () => {
    it('moves file to trash and empties trash', () => {
      vfs.writeFile('/home/aether/trash_test.txt', 'to be trashed');
      expect(vfs.exists('/home/aether/trash_test.txt')).toBe(true);

      const trashDest = vfs.moveToTrash('/home/aether/trash_test.txt');
      expect(vfs.exists('/home/aether/trash_test.txt')).toBe(false);
      expect(vfs.exists(trashDest)).toBe(true);

      const deletedCount = vfs.emptyTrash();
      expect(deletedCount).toBeGreaterThanOrEqual(1);
      expect(vfs.exists(trashDest)).toBe(false);
    });

    it('can restore item from trash back to documents', () => {
      vfs.writeFile('/home/aether/restore_me.txt', 'important document');
      const trashDest = vfs.moveToTrash('/home/aether/restore_me.txt');
      expect(vfs.exists('/home/aether/restore_me.txt')).toBe(false);

      const fileName = trashDest.split('/').pop()!;
      const cleanName = fileName.replace(/^\d+_/, '');
      const restoreDest = vfs.resolve('/home/aether/Documents', cleanName);

      vfs.rename(trashDest, restoreDest);
      expect(vfs.exists(restoreDest)).toBe(true);
      expect(vfs.readFile(restoreDest)).toBe('important document');
    });
  });

  describe('Audio Service synthesizer controls', () => {
    it('toggles mute correctly', () => {
      const initialMuted = audioService.isSoundMuted();
      const toggled = audioService.toggleMute();
      expect(toggled).toBe(!initialMuted);
      expect(audioService.isSoundMuted()).toBe(toggled);

      // Restore initial state
      audioService.toggleMute();
      expect(audioService.isSoundMuted()).toBe(initialMuted);
    });

    it('sets and clamps master volume correctly', () => {
      audioService.setVolume(0.75);
      expect(audioService.getVolume()).toBe(0.75);

      audioService.setVolume(1.5);
      expect(audioService.getVolume()).toBe(1.0);

      audioService.setVolume(-0.5);
      expect(audioService.getVolume()).toBe(0.0);
    });
  });

  describe('Virtual Kernel System Queries', () => {
    it('reports valid kernel version string', () => {
      const ver = virtualKernel.getKernelVersion();
      expect(ver).toBe('6.8.0-aether');
    });

    it('reports uptime and metrics', () => {
      expect(virtualKernel.getUptimeSeconds()).toBeGreaterThanOrEqual(0);
      expect(virtualKernel.getFormattedUptime()).toBeDefined();
      const mem = virtualKernel.getTotalMemoryUsage();
      expect(mem.totalKb).toBeGreaterThan(0);
      expect(mem.percent).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Shell Persistent History Handling', () => {
    it('appends and reads from .aesh_history', () => {
      const histPath = '/home/aether/.aesh_history';
      vfs.appendFile(histPath, 'echo hello\n');
      vfs.appendFile(histPath, 'ls -la\n');

      expect(vfs.exists(histPath)).toBe(true);
      const content = vfs.readFile(histPath);
      expect(content).toContain('echo hello');
      expect(content).toContain('ls -la');
    });
  });
});
