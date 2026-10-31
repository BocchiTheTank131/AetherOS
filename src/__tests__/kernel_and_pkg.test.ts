import { describe, it, expect, beforeEach } from 'vitest';
import { virtualKernel } from '../core/kernel';
import { systemEventBus } from '../core/eventBus';
import { systemLogger } from '../core/logger';
import { packageManager } from '../pkg/packageManager';
import { vfs } from '../vfs/vfs';

describe('AetherCore Virtual Kernel & Services', () => {
  beforeEach(async () => {
    await vfs.init();
    await packageManager.init();
  });

  it('initializes kernel space with systemd and kthreadd', () => {
    const initProc = virtualKernel.getProcess(1);
    expect(initProc).toBeDefined();
    expect(initProc?.name).toBe('systemd');
    expect(initProc?.user).toBe('root');

    const procs = virtualKernel.getProcesses();
    expect(procs.length).toBeGreaterThanOrEqual(2);
  });

  it('handles process signals (SIGSTOP, SIGCONT, SIGKILL)', () => {
    const proc = virtualKernel.spawn({
      name: 'test-daemon',
      command: '/usr/bin/test-daemon',
      user: 'aether',
    });

    expect(proc.state).toBe('running');

    // SIGSTOP
    virtualKernel.kill(proc.pid, 'SIGSTOP');
    expect(virtualKernel.getProcess(proc.pid)?.state).toBe('stopped');

    // SIGCONT
    virtualKernel.kill(proc.pid, 'SIGCONT');
    expect(virtualKernel.getProcess(proc.pid)?.state).toBe('running');

    // SIGKILL
    virtualKernel.kill(proc.pid, 'SIGKILL');
    expect(virtualKernel.getProcess(proc.pid)).toBeUndefined();
  });

  it('records structured logs and formats journalctl / dmesg', () => {
    systemLogger.info('test-subsystem', 'Test log message 123');
    const logs = systemLogger.getLogs({ subsystem: 'test-subsystem' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[logs.length - 1].message).toBe('Test log message 123');

    const journal = systemLogger.formatJournal();
    expect(journal.some((j) => j.includes('Test log message 123'))).toBe(true);
  });

  it('handles typed system event bus subscribe and unsubscribe', () => {
    let receivedPayload: string | null = null;
    const unsub = systemEventBus.on('package:installed', (payload) => {
      receivedPayload = payload.packageId;
    });

    systemEventBus.emit('package:installed', { packageId: 'test-pkg' });
    expect(receivedPayload).toBe('test-pkg');

    unsub();
    systemEventBus.emit('package:installed', { packageId: 'another-pkg' });
    expect(receivedPayload).toBe('test-pkg'); // Did not change after unsub
  });

  it('manages VFS trash, permissions and recursive directory copy', () => {
    vfs.mkdir('/home/aether/test_dir', { recursive: true });
    vfs.writeFile('/home/aether/test_dir/file.txt', 'Content A');

    // Chmod
    vfs.chmod('/home/aether/test_dir/file.txt', 0o777);
    expect(vfs.stat('/home/aether/test_dir/file.txt').permissions).toBe(0o777);

    // Copy directory recursively
    vfs.copy('/home/aether/test_dir', '/home/aether/test_dir_copy', { recursive: true });
    expect(vfs.exists('/home/aether/test_dir_copy/file.txt')).toBe(true);
    expect(vfs.readFile('/home/aether/test_dir_copy/file.txt')).toBe('Content A');

    // Trash
    const trashPath = vfs.moveToTrash('/home/aether/test_dir_copy/file.txt');
    expect(vfs.exists('/home/aether/test_dir_copy/file.txt')).toBe(false);
    expect(vfs.exists(trashPath)).toBe(true);

    // Empty trash
    vfs.emptyTrash();
    expect(vfs.exists(trashPath)).toBe(false);
  });
});
