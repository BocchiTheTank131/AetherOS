import { describe, it, expect, beforeEach } from 'vitest';
import { vfs } from '../vfs/vfs';
import { shellExecutor } from '../shell/executor';
import { createDefaultShellContext } from '../shell/environment';
import { virtualKernel } from '../core/kernel';
import { packageManager } from '../pkg/packageManager';

describe('VFS and Shell Integration', () => {
  beforeEach(async () => {
    await vfs.init();
    await packageManager.init();
  });

  it('initializes default linux filesystem structure', () => {
    expect(vfs.exists('/')).toBe(true);
    expect(vfs.exists('/bin')).toBe(true);
    expect(vfs.exists('/etc/hostname')).toBe(true);
    expect(vfs.readFile('/etc/hostname').trim()).toBe('aetheros');
    expect(vfs.exists('/home/aether/Desktop')).toBe(true);
  });

  it('creates and reads files with shell redirection', async () => {
    const ctx = createDefaultShellContext();
    const res1 = await shellExecutor.execute('echo "Hello AetherOS" > test.txt', ctx);
    expect(res1.exitCode).toBe(0);

    expect(vfs.exists('/home/aether/test.txt')).toBe(true);
    expect(vfs.readFile('/home/aether/test.txt').trim()).toBe('Hello AetherOS');

    const res2 = await shellExecutor.execute('cat test.txt', ctx);
    expect(res2.exitCode).toBe(0);
    expect(res2.stdout.trim()).toBe('Hello AetherOS');
  });

  it('supports pipelines and grep', async () => {
    const ctx = createDefaultShellContext();
    await shellExecutor.execute('echo "apple\\nbanana\\ncherry" > fruits.txt', ctx);

    const res = await shellExecutor.execute('cat fruits.txt | grep nan', ctx);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('nan');
    expect(res.stdout).not.toContain('apple');
  });

  it('supports conditional chaining && and ||', async () => {
    const ctx = createDefaultShellContext();
    const res1 = await shellExecutor.execute('true && echo "success"', ctx);
    expect(res1.stdout.trim()).toBe('success');

    const res2 = await shellExecutor.execute('false && echo "should not run"', ctx);
    expect(res2.stdout).toBe('');

    const res3 = await shellExecutor.execute('false || echo "fallback"', ctx);
    expect(res3.stdout.trim()).toBe('fallback');
  });

  it('supports environment variable expansion', async () => {
    const ctx = createDefaultShellContext();
    const res = await shellExecutor.execute('echo "User is $USER in $HOME"', ctx);
    expect(res.stdout.trim()).toBe('User is aether in /home/aether');
  });

  it('manages kernel processes and signals', () => {
    const proc = virtualKernel.spawn({
      name: 'worker-daemon',
      command: '/usr/bin/worker',
      user: 'aether',
    });

    expect(proc.pid).toBeGreaterThanOrEqual(100);
    expect(virtualKernel.getProcess(proc.pid)).toBeDefined();

    // Send SIGTERM
    virtualKernel.kill(proc.pid, 'SIGTERM');
    expect(virtualKernel.getProcess(proc.pid)).toBeUndefined();
  });

  it('installs and removes packages via aetherpkg', async () => {
    const ctx = createDefaultShellContext();
    const resInstall = await shellExecutor.execute('aetherpkg install game2048', ctx);
    expect(resInstall.exitCode).toBe(0);
    expect(resInstall.stdout).toContain('Successfully installed');
    expect(packageManager.get('game2048')?.installed).toBe(true);

    const resRemove = await shellExecutor.execute('aetherpkg remove game2048', ctx);
    expect(resRemove.exitCode).toBe(0);
    expect(packageManager.get('game2048')?.installed).toBe(false);
  });

  it('executes complex shell scripts with loops and variables', async () => {
    const ctx = createDefaultShellContext();
    const script = `
      VAR=10
      echo "Count is $VAR"
      touch file1.txt file2.txt
      ls file*.txt
    `;
    const res = await shellExecutor.executeScript(script, ctx);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Count is 10');
    expect(res.stdout).toContain('file1.txt');
    expect(res.stdout).toContain('file2.txt');
  });
});
