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
          stdout: 'Version 5.8.0-aether (TypeScript Compiler for AetherOS)\n',
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
      let configPath = `${cwd}/tsconfig.json`;
      const pIdx = args.indexOf('-p');
      const pArg = pIdx !== -1 ? args[pIdx + 1] : undefined;
      if (pArg) {
        configPath = vfs.resolve(cwd, pArg);
      }

      // Check single file compilation: tsc main.ts
      const files = args.filter((a) => !a.startsWith('-') && a !== pArg);
      let entryFile: string | undefined = undefined;

      if (files.length > 0) {
        entryFile = vfs.resolve(cwd, files[0]);
        if (!vfs.exists(entryFile)) {
          return {
            stdout: '',
            stderr: `error TS5058: The specified path does not exist: '${files[0]}'.\n`,
            exitCode: 1,
          };
        }
      }

      try {
        const result = await typeScriptCompiler.compile({
          entryFile,
          cwd,
          noEmit,
          configPath,
        });

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
