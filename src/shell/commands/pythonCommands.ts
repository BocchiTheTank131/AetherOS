// AetherOS - Python Shell Commands (python, python3)
import type { RegisteredCommand, ExecutionResult } from '../types';
import { pythonRuntime } from '../../runtimes/python/PythonRuntime';
import { vfs } from '../../vfs/vfs';

export const pythonCommands: RegisteredCommand[] = [
  {
    name: 'python',
    description: 'Python 3 programming language interpreter (Pyodide WebAssembly)',
    usage: 'python [-c cmd | file] [arg] ...',
    manual: `python - an interpreted, interactive, object-oriented programming language

Options:
  -c cmd     : program passed in as string
  -V, --version : print the Python version number and exit
  -h, --help    : print this help message and exit`,
    execute: async (args, context, stdin): Promise<ExecutionResult> => {
      if (args.length === 0) {
        if (stdin.trim()) {
          const res = await pythonRuntime.execute({
            code: stdin,
            filename: '<stdin>',
            cwd: context.cwd,
          });
          return { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode };
        }
        return {
          stdout: `${pythonRuntime.version} [AetherOS WebAssembly]\nType "help", "copyright", "credits" or "license" for more information.\n`,
          stderr: '',
          exitCode: 0,
        };
      }

      if (args[0] === '--version' || args[0] === '-V') {
        return {
          stdout: `${pythonRuntime.version}\n`,
          stderr: '',
          exitCode: 0,
        };
      }

      if (args[0] === '--help' || args[0] === '-h') {
        return {
          stdout: `usage: python [option] ... [-c cmd | file] [arg] ...\nOptions and arguments:\n-c cmd : program passed in as string\n--version : print Python version\n`,
          stderr: '',
          exitCode: 0,
        };
      }

      // python -c "print(...)"
      if (args[0] === '-c') {
        const cmd = args[1];
        if (!cmd) {
          return { stdout: '', stderr: 'Argument expected for the -c option\n', exitCode: 2 };
        }
        const scriptArgs = args.slice(2);
        const res = await pythonRuntime.execute({
          code: cmd,
          filename: '-c',
          cwd: context.cwd,
          args: scriptArgs,
        });
        return { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode };
      }

      // python <file> [args...]
      const targetFile = args[0];
      const scriptArgs = args.slice(1);
      const absPath = vfs.resolve(context.cwd, targetFile);

      if (!vfs.exists(absPath)) {
        return {
          stdout: '',
          stderr: `python: can't open file '${targetFile}': [Errno 2] No such file or directory\n`,
          exitCode: 2,
        };
      }

      try {
        const code = vfs.readFile(absPath);
        const res = await pythonRuntime.execute({
          code,
          filename: targetFile,
          cwd: context.cwd,
          args: scriptArgs,
        });
        return { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode };
      } catch (err) {
        return {
          stdout: '',
          stderr: `python error: ${(err as Error).message}\n`,
          exitCode: 1,
        };
      }
    },
  },
  {
    name: 'python3',
    description: 'Python 3 interpreter alias',
    usage: 'python3 [-c cmd | file] [arg] ...',
    execute: async (args, context, stdin) => {
      const pythonCmd = pythonCommands[0];
      return await pythonCmd.execute(args, context, stdin);
    },
  },
];
