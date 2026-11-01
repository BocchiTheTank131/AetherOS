import { describe, it, expect, beforeEach } from 'vitest';
import { dialogService } from '../core/dialog';
import { systemLogger } from '../core/logger';
import { vfs } from '../vfs/vfs';
import { virtualKernel } from '../core/kernel';

describe('AetherOS Quality, Polish & Reliability Overhaul v2', () => {
  beforeEach(async () => {
    await vfs.init();
  });

  describe('Centralized System Dialog Service (dialogService)', () => {
    beforeEach(() => {
      dialogService.close();
    });

    it('dispatches and resolves an alert dialog', async () => {
      let activeRequest: any = null;
      const unsubscribe = dialogService.subscribe((req) => {
        if (req) activeRequest = req;
      });

      const alertPromise = dialogService.alert({
        title: 'Information Alert',
        message: 'This is an informative system notice.',
        level: 'info',
      });

      expect(dialogService.isOpen()).toBe(true);
      expect(activeRequest).not.toBeNull();
      expect(activeRequest.type).toBe('alert');
      expect(activeRequest.title).toBe('Information Alert');

      // Resolve the dialog
      activeRequest.resolve();
      await alertPromise;

      expect(dialogService.isOpen()).toBe(false);
      unsubscribe();
    });

    it('handles confirm dialogs (confirming true and cancelling false)', async () => {
      let activeRequest: any = null;
      const unsubscribe = dialogService.subscribe((req) => {
        if (req) activeRequest = req;
      });

      // Test Confirmation: Yes
      const confirmPromiseTrue = dialogService.confirm({
        title: 'Confirm Action',
        message: 'Proceed with this operation?',
        confirmText: 'Yes',
      });

      expect(activeRequest.type).toBe('confirm');
      activeRequest.resolve(true);
      const resTrue = await confirmPromiseTrue;
      expect(resTrue).toBe(true);

      // Test Confirmation: No/Cancel
      const confirmPromiseFalse = dialogService.confirm({
        title: 'Dangerous Operation',
        message: 'Delete critical database?',
        danger: true,
      });

      expect(activeRequest.type).toBe('confirm');
      expect(activeRequest.danger).toBe(true);
      activeRequest.resolve(false);
      const resFalse = await confirmPromiseFalse;
      expect(resFalse).toBe(false);

      unsubscribe();
    });

    it('handles prompt dialog with validation and default value', async () => {
      let activeRequest: any = null;
      const unsubscribe = dialogService.subscribe((req) => {
        if (req) activeRequest = req;
      });

      const promptPromise = dialogService.prompt({
        title: 'Create Folder',
        message: 'Enter directory name:',
        defaultValue: 'MyProject',
        validate: (val) => (val.trim().length === 0 ? 'Folder name cannot be blank' : null),
      });

      expect(activeRequest.type).toBe('prompt');
      expect(activeRequest.defaultValue).toBe('MyProject');
      expect(activeRequest.validate('')).toBe('Folder name cannot be blank');
      expect(activeRequest.validate('ValidName')).toBeNull();

      activeRequest.resolve('NewDirectory');
      const result = await promptPromise;
      expect(result).toBe('NewDirectory');

      unsubscribe();
    });

    it('queues multiple sequential dialogs without clobbering state', async () => {
      const requestsSeen: any[] = [];
      const unsubscribe = dialogService.subscribe((req) => {
        if (req) requestsSeen.push(req);
      });

      const p1 = dialogService.alert({ title: 'Dialog 1', message: 'First' });
      const p2 = dialogService.alert({ title: 'Dialog 2', message: 'Second' });

      // First dialog is currently active
      expect(requestsSeen.length).toBe(1);
      expect(requestsSeen[0].title).toBe('Dialog 1');

      // Resolve first dialog, second dialog should activate
      requestsSeen[0].resolve();
      await p1;

      expect(requestsSeen.length).toBe(2);
      expect(requestsSeen[1].title).toBe('Dialog 2');

      requestsSeen[1].resolve();
      await p2;

      expect(dialogService.isOpen()).toBe(false);
      unsubscribe();
    });
  });

  describe('Application Logging and Error Tracking', () => {
    it('records application level exceptions through systemLogger', () => {
      const initialCount = systemLogger.getLogs().length;
      systemLogger.error('app', 'Application test crash simulation', {
        appId: 'test-app',
        stack: 'Error: Simulated error at Component.render',
      });

      const entries = systemLogger.getLogs();
      expect(entries.length).toBeGreaterThan(initialCount);
      const lastEntry = entries[entries.length - 1];
      expect(lastEntry.level).toBe('error');
      expect(lastEntry.subsystem).toBe('app');
      expect(lastEntry.message).toContain('Application test crash simulation');
    });
  });

  describe('VFS Path Navigation & Address Bar Operations', () => {
    it('validates directory navigation paths correctly', () => {
      // Create a test directory hierarchy
      vfs.mkdir('/home/aether/Projects/test-nav', { recursive: true });
      expect(vfs.exists('/home/aether/Projects/test-nav')).toBe(true);
      expect(vfs.stat('/home/aether/Projects/test-nav').isDirectory()).toBe(true);

      // Verify normalization
      const resolved = vfs.normalizePath('/home/aether/Projects/../Projects/test-nav');
      expect(resolved).toBe('/home/aether/Projects/test-nav');

      // Verify file vs directory distinction
      vfs.writeFile('/home/aether/Projects/test-nav/file.txt', 'hello world');
      expect(vfs.stat('/home/aether/Projects/test-nav/file.txt').isFile()).toBe(true);
      expect(vfs.stat('/home/aether/Projects/test-nav/file.txt').isDirectory()).toBe(false);
    });

    it('safely handles non-existent paths without throwing', () => {
      const nonExistent = '/non/existent/path/here';
      expect(vfs.exists(nonExistent)).toBe(false);
    });
  });

  describe('Virtual Kernel Process Resource Accounting', () => {
    it('cleans up kernel process table on termination', () => {
      const proc = virtualKernel.spawn({
        name: 'test-daemon',
        command: '/usr/bin/daemon',
        args: ['--listen'],
        user: 'aether',
      });

      expect(proc.pid).toBeGreaterThanOrEqual(100);
      expect(virtualKernel.getProcess(proc.pid)).toBeDefined();

      virtualKernel.exit(proc.pid, 0);
      expect(virtualKernel.getProcess(proc.pid)).toBeUndefined();
    });
  });
});
