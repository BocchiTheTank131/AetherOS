import { beforeAll, expect, it } from 'vitest';
import { vfs } from '../vfs/vfs';
import { gitService } from '../git/GitService';
import { typeScriptCompiler } from '../runtimes/typescript/TypeScriptCompiler';
import { typeScriptService } from '../runtimes/typescript/TypeScriptService';
import { PythonFileBridge } from '../runtimes/python/PythonFileBridge';
import { taskManager } from '../developer/TaskManager';
import { virtualKernel } from '../core/kernel';

const root = '/home/aether/Projects/workstation-regressions';
const bytes = (value: string) => new TextEncoder().encode(value);

beforeAll(async () => {
  await vfs.init();
  vfs.mkdir(root, { recursive: true });
});

it('honors tsconfig file selection, strict checks, output, and navigation across files', async () => {
  const dir = root + '/types';
  vfs.mkdir(dir + '/src', { recursive: true });
  vfs.writeText(dir + '/tsconfig.json', JSON.stringify({
    compilerOptions: { rootDir: 'src', outDir: 'build', strict: true, noEmit: true },
    include: ['src/**/*.ts'],
    exclude: ['src/ignored.ts'],
  }));
  vfs.writeText(dir + '/src/ignored.ts', 'const invalid: number = false;');
  vfs.writeText(dir + '/src/value.ts', 'export const identity = <T>(value: T): T => value;');
  const file = dir + '/src/main.ts';
  const good = 'import { identity } from "./value";\nconst result: number = identity(42);\nconsole.log(result);';
  vfs.writeText(file, good);
  const valid = await typeScriptCompiler.compile({ cwd: dir });
  expect(valid.diagnostics).toEqual([]);
  expect(valid.success).toBe(true);
  expect(vfs.exists(dir + '/build')).toBe(false);
  const locations = await typeScriptService.getDefinition(good, 2, 27, { file, root: dir });
  expect(locations[0]).toMatchObject({ file: dir + '/src/value.ts', line: 1 });
  const invalid = await typeScriptCompiler.compile({ cwd: dir, noEmit: true }, { [file]: good.replace('42', '"bad"') });
  expect(invalid.diagnostics).toContainEqual(expect.objectContaining({ code: 'TS2322', file, line: 2 }));
  expect(vfs.readText(file)).toBe(good);
});

it('synchronizes only changed Python files and refuses conflicting writes without a partial update', () => {
  const dir = root + '/python';
  vfs.mkdir(dir);
  vfs.writeText(dir + '/source.txt', 'before');
  vfs.writeText(dir + '/unchanged.txt', 'before');
  const before = PythonFileBridge.loadProjectFiles(dir);
  vfs.writeText(dir + '/unchanged.txt', 'external');
  PythonFileBridge.commitFiles(dir, before, { ...before, 'output.txt': bytes('created') });
  expect(vfs.readText(dir + '/unchanged.txt')).toBe('external');
  expect(vfs.readText(dir + '/output.txt')).toBe('created');
  vfs.writeText(dir + '/source.txt', 'changed externally');
  expect(() => PythonFileBridge.commitFiles(dir, before, {
    'new.txt': bytes('should not persist'), 'source.txt': bytes('conflicting'), 'unchanged.txt': before['unchanged.txt'],
  })).toThrow(/conflict/);
  expect(vfs.exists(dir + '/new.txt')).toBe(false);
  expect(vfs.readText(dir + '/source.txt')).toBe('changed externally');
  expect(() => PythonFileBridge.validateFiles({ 'src/../../escape': bytes('forbidden') })).toThrow();
  const latest = PythonFileBridge.loadProjectFiles(dir);
  delete latest['source.txt'];
  PythonFileBridge.commitFiles(dir, PythonFileBridge.loadProjectFiles(dir), latest);
  expect(vfs.exists(dir + '/source.txt')).toBe(false);
});

it('streams independent kernel tasks and cleans up cancellation and timeout', async () => {
  let pid = 0;
  let started: () => void;
  const streaming = new Promise<void>((resolve) => { started = resolve; });
  const output: string[] = [];
  const first = taskManager.runTask(root, { id: 'hold', name: 'Hold', command: 'echo started && sleep 10 && echo should-not-run' }, (chunk) => {
    output.push(chunk);
    if (chunk === 'started\n') started();
  }, (task) => { pid = task.pid; });
  const second = taskManager.runTask(root, { id: 'timeout', name: 'Timeout', command: 'sleep 10', timeoutMs: 100 });
  await streaming;
  expect(virtualKernel.getProcesses().some((process) => process.pid === pid)).toBe(true);
  expect(taskManager.cancel(pid)).toBe(true);
  expect(await first).toMatchObject({ status: 'cancelled', exitCode: 130 });
  const timedOut = await second;
  expect(timedOut).toMatchObject({ status: 'timed-out', exitCode: 124 });
  expect(timedOut.pid).not.toBe(pid);
  expect(output.join('')).not.toContain('should-not-run\n');
  expect(virtualKernel.getProcesses().some((process) => process.pid === pid || process.pid === timedOut.pid)).toBe(false);
});

it('stages and unstages deletions, restores index bytes and protects tracked checkout changes', async () => {
  const dir = root + '/git';
  const file = dir + '/bytes.bin';
  const original = new Uint8Array([0, 255, 42]);
  await gitService.init(dir);
  vfs.writeBytesSync(file, original);
  await gitService.add(dir, 'bytes.bin');
  await gitService.commit(dir, 'Track binary');
  await gitService.branch(dir, 'topic');
  vfs.unlink(file);
  expect((await gitService.status(dir)).unstaged[0].status).toBe('deleted');
  await gitService.add(dir, '.');
  expect((await gitService.status(dir)).staged[0].status).toBe('deleted');
  expect((await gitService.diff(dir, undefined, 'staged'))[0].isBinary).toBe(true);
  await expect(gitService.checkout(dir, 'topic')).rejects.toThrow(/tracked changes/);
  await gitService.unstage(dir, 'bytes.bin');
  await gitService.restore(dir, 'bytes.bin');
  expect(vfs.readBytes(file)).toEqual(original);
  await gitService.checkout(dir, 'topic');
  expect(await gitService.currentBranch(dir)).toBe('topic');
});
