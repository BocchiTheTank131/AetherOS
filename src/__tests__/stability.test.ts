import { indexedDB } from 'fake-indexeddb';
import { expect, it, vi } from 'vitest';
import { zipSync, strToU8, type Zippable } from 'fflate';
import { IndexedDBStorage } from '../vfs/idbStorage';
import { vfs } from '../vfs/vfs';
import { AppStorage, resolveAppFilesystemPath } from '../appPlatform/AppStorage';
import { PackageArchive } from '../pkg/packageArchive';
import { runtimeManager } from '../runtime/RuntimeManager';
import { virtualKernel } from '../core/kernel';

it('rejects traversal and private cross-app file and symlink access', async () => {
  await vfs.init();
  const store = new AppStorage();
  await store.set('dev.owner', 'private', 'secret');
  const target = '/home/aether/.local/share/aether/apps/dev.owner/storage.json';
  const link = '/home/aether/escape';
  vfs.symlink(target, link);
  expect(() => resolveAppFilesystemPath('dev.attacker', target)).toThrow(/protected/);
  expect(() => resolveAppFilesystemPath('dev.attacker', link)).toThrow(/symbolic/i);
  await expect(store.set('.', 'data', 1)).rejects.toThrow(/identifier/i);
  await expect(store.set('dev.owner', 'data', '🙂'.repeat(1_350_000))).rejects.toThrow(/quota/i);
  expect(await store.get('dev.owner', 'private')).toBe('secret');
});

it('rejects unsafe, aliased and oversized ZIP entries before staging', async () => {
  const archives: Zippable[] = [
    { '/escape': strToU8('attack') },
    { 'a/./b': strToU8('first'), 'a/b': strToU8('second') },
    { 'large.txt': new Uint8Array(2 * 1024 * 1024) },
  ];
  for (const entries of archives) {
    await expect(PackageArchive.unpack(zipSync(entries))).rejects.toThrow(/ZIP archive/);
  }
});

it('retains queued writes during IndexedDB commits and rejects stale cross-tab writes', async () => {
  vi.stubGlobal('indexedDB', indexedDB);
  try {
    const first = new IndexedDBStorage();
    const second = new IndexedDBStorage();
    await Promise.all([first.init(), second.init()]);
    await Promise.all([first.loadAll(), second.loadAll()]);
    const path = '/home/aether/durable.txt';
    const node = { ...vfs.getNodeRaw('/home/aether')!, name: 'durable.txt', path, parentPath: '/home/aether', type: 'file' as const };
    first.queueSave({ ...node, content: 'initial' });
    const pending = first.flush();
    first.queueDelete(path);
    first.queueSave({ ...node, content: 'final' });
    expect(await pending).toBe(true);
    second.queueDelete(path);
    expect(await second.flush()).toBe(false);
    expect(second.getPersistenceStatus()).toBe('conflict');
    expect((await first.loadAll()).get(path)?.content).toBe('final');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('keeps retryable data after an IndexedDB transaction aborts', async () => {
  vi.stubGlobal('indexedDB', indexedDB);
  try {
    const storage = new IndexedDBStorage();
    await storage.init();
    await storage.loadAll();
    const node = { ...vfs.getNodeRaw('/home/aether')!, type: 'file' as const, path: '/retry.txt', name: 'retry.txt', parentPath: '/' };
    storage.queueSave({ ...node, content: 'kept' });
    const uncloneable = { ...node, path: '/invalid.txt', name: 'invalid.txt', invalid: () => {} };
    storage.queueSave(uncloneable);
    expect(await storage.flush()).toBe(false);
    expect(storage.getPersistenceStatus()).toBe('error');
    expect((await storage.loadAll()).get(node.path)).toBeUndefined();
    storage.queueDelete('/invalid.txt');
    expect(await storage.flush()).toBe(true);
    expect((await storage.loadAll()).get(node.path)?.content).toBe('kept');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('does not execute guest code without a worker and terminates running guests on SIGKILL', async () => {
  vi.stubGlobal('Worker', undefined);
  try {
    const result = await runtimeManager.execute('throw new Error("guest executed")');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Web Workers are required');
  } finally {
    vi.unstubAllGlobals();
  }
  const session = runtimeManager.createSession();
  const running = session.execute('while (true) {}');
  expect(virtualKernel.kill(session.pid, 'SIGKILL')).toBe(true);
  expect((await running).exitCode).toBe(137);
});


it('bounds JavaScript result and filesystem transfer sizes before posting them to the host', async () => {
  const output = await runtimeManager.execute('return "x".repeat(3 * 1024 * 1024)');
  expect(output.exitCode).toBe(1);
  expect(output.stderr).toContain('result exceeds');
  const write = await runtimeManager.execute('await aether.fs.writeText("/tmp/oversized", "x".repeat(3 * 1024 * 1024))');
  expect(write.exitCode).toBe(1);
  expect(vfs.exists('/tmp/oversized')).toBe(false);
});
