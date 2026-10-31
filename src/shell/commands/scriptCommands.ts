// AetherOS - aesh Scripting & Job Control Commands (test, [, jobs, fg, bg, wait, source, .)
import type { RegisteredCommand, ExecutionResult } from '../types';
import { vfs } from '../../vfs/vfs';

function evaluateTest(args: string[], cwd: string): boolean {
  if (args.length === 0) return false;

  // Unary negation at the start of expression
  if (args[0] === '!') {
    return !evaluateTest(args.slice(1), cwd);
  }

  // 1 argument: true if non-empty string
  if (args.length === 1) {
    return args[0].length > 0;
  }

  // 2 arguments: unary tests
  if (args.length === 2) {
    const [op, target] = args;
    const resolved = vfs.resolve(cwd, target);

    switch (op) {
      case '-f': // Regular file
        return vfs.exists(resolved) && vfs.stat(resolved).isFile();
      case '-d': // Directory
        return vfs.exists(resolved) && vfs.stat(resolved).isDirectory();
      case '-e': // Exists
        return vfs.exists(resolved);
      case '-s': // Size > 0
        return vfs.exists(resolved) && vfs.stat(resolved).size > 0;
      case '-L':
      case '-h': // Symbolic link
        return vfs.exists(resolved) && vfs.lstat(resolved).isSymbolicLink();
      case '-r': // Readable
      case '-w': // Writable
      case '-x': // Executable
        return vfs.exists(resolved);
      case '-z': // Zero length
        return target.length === 0;
      case '-n': // Non-zero length
        return target.length > 0;
      default:
        return false;
    }
  }

  // 3 arguments: binary comparisons
  if (args.length === 3) {
    const [left, op, right] = args;
    const n1 = parseInt(left, 10);
    const n2 = parseInt(right, 10);

    switch (op) {
      case '=':
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '-eq':
        return !isNaN(n1) && !isNaN(n2) && n1 === n2;
      case '-ne':
        return !isNaN(n1) && !isNaN(n2) && n1 !== n2;
      case '-lt':
        return !isNaN(n1) && !isNaN(n2) && n1 < n2;
      case '-le':
        return !isNaN(n1) && !isNaN(n2) && n1 <= n2;
      case '-gt':
        return !isNaN(n1) && !isNaN(n2) && n1 > n2;
      case '-ge':
        return !isNaN(n1) && !isNaN(n2) && n1 >= n2;
      default:
        return false;
    }
  }

  return false;
}

export const scriptCommands: RegisteredCommand[] = [
  {
    name: 'test',
    description: 'Check file types and compare values',
    usage: 'test <expression>',
    manual: 'test - evaluate conditional expressions (POSIX test)',
    execute: (args, context): ExecutionResult => {
      const result = evaluateTest(args, context.cwd);
      return {
        stdout: '',
        stderr: '',
        exitCode: result ? 0 : 1,
      };
    },
  },
  {
    name: '[',
    description: 'Evaluate conditional expressions (synonym for test)',
    usage: '[ <expression> ]',
    manual: '[ - evaluate conditional expression with mandatory trailing ]',
    execute: (args, context): ExecutionResult => {
      if (args.length === 0 || args[args.length - 1] !== ']') {
        return {
          stdout: '',
          stderr: "[: missing ']'\n",
          exitCode: 2,
        };
      }
      const testArgs = args.slice(0, args.length - 1);
      const result = evaluateTest(testArgs, context.cwd);
      return {
        stdout: '',
        stderr: '',
        exitCode: result ? 0 : 1,
      };
    },
  },
  {
    name: 'jobs',
    description: 'Display status of jobs in the current session',
    usage: 'jobs [-l]',
    manual: 'jobs - list active background jobs',
    execute: (_args, context): ExecutionResult => {
      if (!context.jobs || context.jobs.size === 0) {
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      const lines: string[] = [];
      for (const [id, job] of context.jobs.entries()) {
        const statusStr = job.status === 'running' ? 'Running' : job.status === 'stopped' ? 'Stopped' : 'Done';
        lines.push(`[${id}]+  ${statusStr.padEnd(20)} ${job.command} &`);
      }

      return {
        stdout: lines.join('\n') + (lines.length > 0 ? '\n' : ''),
        stderr: '',
        exitCode: 0,
      };
    },
  },
  {
    name: 'fg',
    description: 'Move job to the foreground',
    usage: 'fg [%job_id]',
    manual: 'fg - resume job in foreground',
    execute: async (args, context): Promise<ExecutionResult> => {
      if (!context.jobs || context.jobs.size === 0) {
        return { stdout: '', stderr: 'fg: current: no such job\n', exitCode: 1 };
      }

      let jobId: number | undefined;
      if (args.length > 0) {
        const cleaned = args[0].replace(/^%/, '');
        jobId = parseInt(cleaned, 10);
      } else {
        // Last job
        const keys = Array.from(context.jobs.keys());
        jobId = keys[keys.length - 1];
      }

      const job = context.jobs.get(jobId);
      if (!job) {
        return { stdout: '', stderr: `fg: %${jobId}: no such job\n`, exitCode: 1 };
      }

      job.status = 'running';
      if (job.resultPromise) {
        const res = await job.resultPromise;
        context.jobs.delete(job.id);
        return res;
      }

      context.jobs.delete(job.id);
      return { stdout: `${job.command}\n`, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'bg',
    description: 'Move job to the background',
    usage: 'bg [%job_id]',
    manual: 'bg - resume stopped job in background',
    execute: (args, context): ExecutionResult => {
      if (!context.jobs || context.jobs.size === 0) {
        return { stdout: '', stderr: 'bg: current: no such job\n', exitCode: 1 };
      }

      let jobId: number | undefined;
      if (args.length > 0) {
        const cleaned = args[0].replace(/^%/, '');
        jobId = parseInt(cleaned, 10);
      } else {
        const keys = Array.from(context.jobs.keys());
        jobId = keys[keys.length - 1];
      }

      const job = context.jobs.get(jobId);
      if (!job) {
        return { stdout: '', stderr: `bg: %${jobId}: no such job\n`, exitCode: 1 };
      }

      job.status = 'running';
      return {
        stdout: `[${job.id}]+ ${job.command} &\n`,
        stderr: '',
        exitCode: 0,
      };
    },
  },
  {
    name: 'wait',
    description: 'Wait for process completion and return exit status',
    usage: 'wait [pid | %job_id...]',
    manual: 'wait - wait for background jobs to finish',
    execute: async (args, context): Promise<ExecutionResult> => {
      if (!context.jobs || context.jobs.size === 0) {
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      if (args.length === 0) {
        // Wait for all active background jobs
        const promises = Array.from(context.jobs.values())
          .filter((j) => j.resultPromise)
          .map((j) => j.resultPromise!);
        await Promise.all(promises);
        context.jobs.clear();
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      let lastExit = 0;
      for (const arg of args) {
        const cleaned = arg.replace(/^%/, '');
        const id = parseInt(cleaned, 10);
        const job = Array.from(context.jobs.values()).find((j) => j.id === id || j.pid === id);
        if (job && job.resultPromise) {
          const res = await job.resultPromise;
          lastExit = res.exitCode;
          context.jobs.delete(job.id);
        }
      }

      return { stdout: '', stderr: '', exitCode: lastExit };
    },
  },
  {
    name: 'source',
    description: 'Execute commands from a file in the current shell context',
    usage: 'source <filename> [arguments...]',
    manual: 'source - read and execute commands from filename in the current shell environment',
    execute: async (args, context): Promise<ExecutionResult> => {
      if (args.length === 0) {
        return { stdout: '', stderr: 'source: filename argument required\n', exitCode: 2 };
      }

      const targetPath = vfs.resolve(context.cwd, args[0]);
      if (!vfs.exists(targetPath)) {
        return { stdout: '', stderr: `source: ${args[0]}: No such file or directory\n`, exitCode: 1 };
      }

      const stat = vfs.stat(targetPath);
      if (stat.isDirectory()) {
        return { stdout: '', stderr: `source: ${args[0]}: Is a directory\n`, exitCode: 1 };
      }

      const scriptContent = vfs.readFile(targetPath);
      const { shellExecutor } = await import('../executor');
      return await shellExecutor.executeScript(scriptContent, context, args.slice(1), targetPath);
    },
  },
  {
    name: '.',
    description: 'Execute commands from a file in the current shell context (synonym for source)',
    usage: '. <filename> [arguments...]',
    manual: '. - read and execute commands from filename in the current shell environment',
    execute: async (args, context): Promise<ExecutionResult> => {
      if (args.length === 0) {
        return { stdout: '', stderr: '.: filename argument required\n', exitCode: 2 };
      }

      const targetPath = vfs.resolve(context.cwd, args[0]);
      if (!vfs.exists(targetPath)) {
        return { stdout: '', stderr: `.: ${args[0]}: No such file or directory\n`, exitCode: 1 };
      }

      const scriptContent = vfs.readFile(targetPath);
      const { shellExecutor } = await import('../executor');
      return await shellExecutor.executeScript(scriptContent, context, args.slice(1), targetPath);
    },
  },
];
