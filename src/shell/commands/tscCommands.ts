// AetherOS - TypeScript Compiler CLI Command (tsc)
import type { RegisteredCommand, ExecutionResult } from '../types';
import { typeScriptCompiler } from '../../runtimes/typescript/TypeScriptCompiler';
import { vfs } from '../../vfs/vfs';

export const tscCommands: RegisteredCommand[] = [
  {
    name: 'tsc',
    description: 'TypeScript compiler CLI for AetherOS',
    usage: 'tsc [options] [file...]',
    manual: `tsc - TypeScript Compiler

Options:
  --noEmit        Do not emit compiler outputs
  -p, --project   Compile the project in the given directory or config file
  -v, --version   Print compiler version
  -h, --help      Show help`,
    execute: async (args, context): Promise<ExecutionResult> => {
      const cwd = context.cwd;

      if (args.includes('-v') || args.includes('--version')) {
        return {
          stdout: `Version ${await typeScriptCompiler.version()}\n`,
          stderr: '',
          exitCode: 0,
        };
      }

      if (args.includes('-h') || args.includes('--help')) {
        return {
          stdout: `tsc - TypeScript Compiler\nUsage: tsc [options] [file...]\n\nOptions:\n  --noEmit      Do not emit outputs\n  -p <path>     Compile project tsconfig.json\n`,
          stderr: '',
          exitCode: 0,
        };
      }

      const noEmit = args.includes('--noEmit');
      const pIdx = args.findIndex((arg) => arg === '-p' || arg === '--project');
      const pArg = pIdx === -1 ? undefined : args[pIdx + 1];
      const files = args.filter((arg, index) => !arg.startsWith('-') && (pIdx === -1 || index !== pIdx + 1))
        .map((file) => vfs.resolve(cwd, file));
      let configPath = pArg ? vfs.resolve(cwd, pArg) : undefined;
      if (pIdx !== -1) {
        if (!configPath || !vfs.exists(configPath)) return { stdout: '', stderr: 'tsc: project config does not exist\n', exitCode: 1 };
        if (vfs.stat(configPath).isDirectory()) configPath = vfs.resolve(configPath, 'tsconfig.json');
        if (!vfs.exists(configPath) || files.length) {
          return { stdout: '', stderr: 'tsc: provide a project config or a list of input files\n', exitCode: 1 };
        }
      }
      if (args.some((arg, index) => arg.startsWith('-') && (pIdx === -1 || index !== pIdx + 1) &&
          !['-p', '--project', '--noEmit'].includes(arg))) {
        return { stdout: '', stderr: 'tsc: unsupported compiler flag. Use tsconfig.json for compiler options.\n', exitCode: 1 };
      }
      for (const file of files) {
        if (!vfs.exists(file)) return { stdout: '', stderr: `error TS6053: File '${file}' not found.\n`, exitCode: 1 };
      }

      try {
        const result = await typeScriptCompiler.compile({
          entryFile: files[0],
          files: files.length ? files : undefined,
          cwd,
          noEmit,
          configPath,
        }, undefined, context.signal);

        let out = '';
        let errOut = '';

        for (const diag of result.diagnostics) {
          const formatted = `${diag.file}(${diag.line},${diag.col}): ${diag.severity} ${diag.code}: ${diag.message}\n`;
          if (diag.severity === 'error') {
            errOut += formatted;
          } else {
            out += formatted;
          }
        }

        if (!result.success) {
          return { stdout: out, stderr: errOut, exitCode: 1 };
        }

        if (!noEmit && result.outputFiles) {
          const count = Object.keys(result.outputFiles).length;
          out += `Successfully compiled ${count} file${count > 1 ? 's' : ''}.\n`;
        }

        return { stdout: out, stderr: errOut, exitCode: 0 };
      } catch (err) {
        return {
          stdout: '',
          stderr: `tsc: ${(err as Error).message}\n`,
          exitCode: 1,
        };
      }
    },
  },
];
