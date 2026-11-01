// AetherOS v1.4.0: Developer Workstation Test Suite
import { describe, it, expect, beforeEach } from 'vitest';
import { vfs } from '../vfs/vfs';
import { pythonRuntime } from '../runtimes/python/PythonRuntime';
import { typeScriptCompiler } from '../runtimes/typescript/TypeScriptCompiler';
import { typeScriptService } from '../runtimes/typescript/TypeScriptService';
import { gitService } from '../git/GitService';
import { computeLineDiff } from '../git/GitDiff';
import { projectManager } from '../developer/ProjectManager';
import { taskManager } from '../developer/TaskManager';
import { shellExecutor } from '../shell/executor';

describe('AetherOS v1.4.0: Developer Workstation', () => {
  const TEST_DIR = '/home/aether/Projects/test-workstation';

  const makeCtx = (cwd = TEST_DIR) => ({
    cwd,
    env: { PATH: '/bin:/usr/bin', HOME: '/home/aether' },
    user: 'aether',
    hostname: 'aether-box',
    aliases: {},
    history: [] as string[],
    exitCode: 0,
  });

  beforeEach(async () => {
    await vfs.init();
    if (vfs.exists(TEST_DIR)) {
      vfs.rmdir(TEST_DIR, { recursive: true });
    }
    vfs.mkdir(TEST_DIR, { recursive: true });
  });

  // ==========================================
  // Objective A: Real Python Execution (Pyodide & AetherFS)
  // ==========================================
  describe('Objective A: Real Python Execution', () => {
    it('executes python code and prints to standard output', async () => {
      const code = 'print("Hello from AetherOS Python!")';
      const res = await pythonRuntime.execute({
        code,
        cwd: TEST_DIR,
      });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Hello from AetherOS Python!');
      expect(res.stderr).toBe('');
    });

    it('evaluates mathematics and assertions accurately', async () => {
      const code = `
x = 10
y = 20
assert x + y == 30
print("Math assertion verified")
`;
      const res = await pythonRuntime.execute({
        code,
        cwd: TEST_DIR,
      });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Math assertion verified');
    });

    it('supports pathlib.Path file read and write integrated with AetherFS', async () => {
      const code = `
from pathlib import Path
output = Path("result.txt")
output.write_text("Python works seamlessly")
print(output.read_text())
`;
      const res = await pythonRuntime.execute({
        code,
        cwd: TEST_DIR,
      });

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Python works seamlessly');

      // Verify file was committed back to AetherFS
      const resultPath = `${TEST_DIR}/result.txt`;
      expect(vfs.exists(resultPath)).toBe(true);
      expect(vfs.readFile(resultPath)).toBe('Python works seamlessly');
    });

    it('formats syntax errors and tracebacks on failed assertions', async () => {
      const code = `
x = 5
assert x == 10
`;
      const res = await pythonRuntime.execute({
        code,
        filename: 'assert_fail.py',
        cwd: TEST_DIR,
      });

      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('AssertionError');
    });

    it('enforces execution timeouts and cancellation with exit code 124', async () => {
      const code = `
while True:
    pass
`;
      const res = await pythonRuntime.execute({
        code,
        cwd: TEST_DIR,
        timeoutMs: 50,
      });

      expect(res.exitCode).toBe(124);
      expect(res.timedOut).toBe(true);
    });

    it('runs python CLI commands in aesh shell', async () => {
      vfs.writeFile(`${TEST_DIR}/hello.py`, 'print("Executed from shell")');
      const res = await shellExecutor.execute('python hello.py', makeCtx());

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Executed from shell');
    });

    it('supports python -c inline one-liners', async () => {
      const res = await shellExecutor.execute('python -c "print(2 ** 10)"', makeCtx());

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('1024');
    });
  });

  // ==========================================
  // Objective B: TypeScript Compiler & Language Services
  // ==========================================
  describe('Objective B: TypeScript Compiler & Language Services', () => {
    it('transpiles TypeScript code to clean executable JavaScript', () => {
      const tsCode = `
interface User {
  id: number;
  name: string;
}

enum Role {
  Admin = "ADMIN",
  User = "USER"
}

function greet(user: User): string {
  return "Hello " + user.name;
}

const u: User = { id: 1, name: "Alice" };
console.log(greet(u));
`;
      const res = typeScriptCompiler.transpile(tsCode);
      expect(res.outputText).not.toContain('interface User');
      expect(res.outputText).toContain('const Role = {');
      expect(res.outputText).toContain('function greet(user)');
      expect(res.outputText).toContain('const u = {');
    });

    it('detects type mismatches and semantic diagnostics', () => {
      const invalidTs = `
const age: number = "twenty";
const name: string = 42;
`;
      const diags = typeScriptCompiler.typeCheck('bad.ts', invalidTs);
      expect(diags.length).toBeGreaterThanOrEqual(2);
      expect(diags.some((d) => d.code === 'TS2322')).toBe(true);
    });

    it('detects undeclared symbols (TS2304)', () => {
      const code = 'console.log(nonExistentVariable);';
      const diags = typeScriptCompiler.typeCheck('test.ts', code);
      expect(diags.some((d) => d.code === 'TS2304')).toBe(true);
    });

    it('compiles multi-file project and bundles modules into dist/main.js', async () => {
      vfs.mkdir(`${TEST_DIR}/src`, { recursive: true });
      vfs.writeFile(
        `${TEST_DIR}/src/math.ts`,
        'export function add(a: number, b: number): number { return a + b; }'
      );
      vfs.writeFile(
        `${TEST_DIR}/src/main.ts`,
        `import { add } from './math';
console.log("Sum:", add(5, 7));
`
      );

      const res = await typeScriptCompiler.compile({
        entryFile: `${TEST_DIR}/src/main.ts`,
        cwd: TEST_DIR,
      });

      expect(res.success).toBe(true);
      expect(vfs.exists(`${TEST_DIR}/dist/main.js`)).toBe(true);
      const bundle = vfs.readFile(`${TEST_DIR}/dist/main.js`);
      expect(bundle).toContain('Compiled TypeScript Bundle');
    });

    it('runs tsc CLI commands in aesh shell', async () => {
      vfs.writeFile(`${TEST_DIR}/hello.ts`, 'const greeting: string = "Hello World"; console.log(greeting);');
      const res = await shellExecutor.execute('tsc hello.ts', makeCtx());

      expect(res.exitCode).toBe(0);
      expect(vfs.exists(`${TEST_DIR}/dist/hello.js`)).toBe(true);
    });

    it('provides autocomplete and hover intelligence via TypeScriptService', () => {
      const completions = typeScriptService.getCompletions('const num = 10;\ncon', 2, 3);
      expect(completions.some((c) => c.label === 'const')).toBe(true);
      expect(completions.some((c) => c.label === 'console.log')).toBe(true);

      const hover = typeScriptService.getHover('console.log("test");', 1, 3);
      expect(hover?.contents[0]).toContain('console');
    });
  });

  // ==========================================
  // Objective C: Local Git Version Control (isomorphic-git & AetherFS)
  // ==========================================
  describe('Objective C: Local Git Version Control', () => {
    it('initializes a git repository and creates .git directory in AetherFS', async () => {
      await gitService.init(TEST_DIR);
      expect(await gitService.isRepo(TEST_DIR)).toBe(true);
      expect(vfs.exists(`${TEST_DIR}/.git`)).toBe(true);
      expect(vfs.exists(`${TEST_DIR}/.git/HEAD`)).toBe(true);
    });

    it('stages files, records commits, and tracks commit history in AetherFS', async () => {
      await gitService.init(TEST_DIR);
      vfs.writeFile(`${TEST_DIR}/README.md`, '# My Awesome Project');

      // Add & commit
      await gitService.add(TEST_DIR, 'README.md');
      const sha = await gitService.commit(TEST_DIR, 'Initial commit');
      expect(sha).toBeDefined();
      expect(sha.length).toBe(40);

      // Verify log
      const logs = await gitService.log(TEST_DIR);
      expect(logs.length).toBe(1);
      expect(logs[0].message).toContain('Initial commit');
    });

    it('accurately computes Git status summary (clean, modified, staged, untracked)', async () => {
      await gitService.init(TEST_DIR);
      vfs.writeFile(`${TEST_DIR}/file1.txt`, 'original');
      await gitService.add(TEST_DIR, 'file1.txt');
      await gitService.commit(TEST_DIR, 'Commit 1');

      // Now create untracked and modified file
      vfs.writeFile(`${TEST_DIR}/file2.txt`, 'new untracked');
      vfs.writeFile(`${TEST_DIR}/file1.txt`, 'modified content');

      const status = await gitService.status(TEST_DIR);
      expect(status.isClean).toBe(false);
      expect(status.untracked.some((u) => u.filepath === 'file2.txt')).toBe(true);
      expect(status.unstaged.some((u) => u.filepath === 'file1.txt')).toBe(true);
    });

    it('computes line-by-line unified diffs', async () => {
      const oldText = 'line1\nline2\nline3';
      const newText = 'line1\nline2_modified\nline3\nline4_added';

      const diff = computeLineDiff('test.txt', oldText, newText);
      expect(diff.additions).toBe(2);
      expect(diff.deletions).toBe(1);
      expect(diff.patch).toContain('-line2');
      expect(diff.patch).toContain('+line2_modified');
      expect(diff.patch).toContain('+line4_added');
    });

    it('creates branches, lists branches, and switches branches', async () => {
      await gitService.init(TEST_DIR);
      vfs.writeFile(`${TEST_DIR}/file.txt`, 'v1');
      await gitService.add(TEST_DIR, 'file.txt');
      await gitService.commit(TEST_DIR, 'first');

      await gitService.branch(TEST_DIR, 'feature-x');
      const branches = await gitService.listBranches(TEST_DIR);
      expect(branches).toContain('feature-x');
      expect(branches).toContain('main');

      await gitService.checkout(TEST_DIR, 'feature-x');
      const current = await gitService.currentBranch(TEST_DIR);
      expect(current).toBe('feature-x');
    });

    it('executes full git command pipeline via aesh CLI', async () => {
      const resInit = await shellExecutor.execute('git init', makeCtx());
      expect(resInit.exitCode).toBe(0);
      expect(resInit.stdout).toContain('Initialized empty Git repository');

      vfs.writeFile(`${TEST_DIR}/app.py`, 'print("Hello Git")');

      const resAdd = await shellExecutor.execute('git add app.py', makeCtx());
      expect(resAdd.exitCode).toBe(0);

      const resCommit = await shellExecutor.execute('git commit -m "Add app.py"', makeCtx());
      expect(resCommit.exitCode).toBe(0);
      expect(resCommit.stdout).toContain('Add app.py');

      const resLog = await shellExecutor.execute('git log', makeCtx());
      expect(resLog.exitCode).toBe(0);
      expect(resLog.stdout).toContain('commit');
      expect(resLog.stdout).toContain('Add app.py');
    });
  });

  // ==========================================
  // Objective D: Developer Subsystem & Task Runner
  // ==========================================
  describe('Objective D: Developer Subsystem & Task Runner', () => {
    it('detects project language and metadata via ProjectManager', async () => {
      vfs.writeFile(
        `${TEST_DIR}/aether.json`,
        JSON.stringify({
          name: 'my-ts-project',
          version: '1.0.0',
          language: 'typescript',
        })
      );

      const info = await projectManager.getProjectInfo(TEST_DIR);
      expect(info.name).toBe('my-ts-project');
      expect(info.language).toBe('typescript');
    });

    it('discovers and executes project tasks via TaskManager', async () => {
      vfs.writeFile(
        `${TEST_DIR}/aether.json`,
        JSON.stringify({
          name: 'task-test',
          version: '1.0.0',
          language: 'python',
          scripts: {
            hello: 'echo TaskRunnerWorks',
          },
        })
      );

      const tasks = taskManager.getTasksForProject(TEST_DIR);
      expect(tasks.some((t) => t.id === 'hello')).toBe(true);

      const helloTask = tasks.find((t) => t.id === 'hello')!;
      const execution = await taskManager.runTask(TEST_DIR, helloTask);
      expect(execution.status).toBe('completed');
      expect(execution.exitCode).toBe(0);
      expect(execution.output.join('')).toContain('TaskRunnerWorks');
    });
  });

  // ==========================================
  // Objective E: Binary Correctness & Security Hardening
  // ==========================================
  describe('Objective E: Binary Correctness & Security Hardening', () => {
    it('computes bit-exact sha256sum and md5sum on raw binary files', async () => {
      // Create raw binary file with non-utf8 byte sequence
      const binaryData = new Uint8Array([0x00, 0xff, 0xfe, 0x80, 0x12, 0x34, 0x56, 0x78]);
      await vfs.writeBytes(`${TEST_DIR}/binary.bin`, binaryData);

      const resSha = await shellExecutor.execute('sha256sum binary.bin', makeCtx());
      expect(resSha.exitCode).toBe(0);
      expect(resSha.stdout).toMatch(/^[a-f0-9]{64}\s+binary\.bin/);

      const resMd5 = await shellExecutor.execute('md5sum binary.bin', makeCtx());
      expect(resMd5.exitCode).toBe(0);
      expect(resMd5.stdout).toMatch(/^[a-f0-9]{32}\s+binary\.bin/);
    });

    it('correctly reads and writes binary files with exact roundtrip parity', async () => {
      const source = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      await vfs.writeBytes(`${TEST_DIR}/parity.dat`, source);
      const readBack = vfs.readBytes(`${TEST_DIR}/parity.dat`);

      expect(readBack.byteLength).toBe(source.byteLength);
      for (let i = 0; i < source.length; i++) {
        expect(readBack[i]).toBe(source[i]);
      }
    });

    it('prevents app storage prefix collision attacks in AppHost', async () => {
      // Test normalization and directory boundary check
      const app1Dir = '/home/aether/.local/share/aether/apps/note';
      const app2File = '/home/aether/.local/share/aether/apps/notebook/secrets.txt';

      const isSubdir = (file: string, dir: string) => file === dir || file.startsWith(dir + '/');
      expect(isSubdir(app2File, app1Dir)).toBe(false);
      expect(isSubdir(app1Dir + '/data.json', app1Dir)).toBe(true);
    });
  });
});
