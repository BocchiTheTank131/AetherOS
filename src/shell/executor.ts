// AetherOS - aesh Shell Command Executor
import type { ShellContext, ExecutionResult, SimpleCommand } from './types';
import { tokenize } from './lexer';
import { parse } from './parser';
import { expandVariables, expandGlobs } from './environment';
import { commandRegistry } from './registry';
import { vfs } from '../vfs/vfs';
import { virtualKernel } from '../core/kernel';

export class ShellExecutor {
  public async execute(rawInput: string, context: ShellContext): Promise<ExecutionResult> {
    const input = rawInput.trim();
    if (!input || input.startsWith('#')) {
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    // Add to history
    if (context.history[context.history.length - 1] !== input) {
      context.history.push(input);
    }

    try {
      const tokens = tokenize(input);
      const chains = parse(tokens);

      let finalStdout = '';
      let finalStderr = '';
      let lastExitCode = 0;

      for (let i = 0; i < chains.length; i++) {
        if (context.aborted) {
          finalStderr += '^C\n';
          lastExitCode = 130;
          break;
        }

        const chain = chains[i];

        // Conditional operators
        if (i > 0) {
          const prevOperator = chains[i - 1].operator;
          if (prevOperator === 'AND' && lastExitCode !== 0) {
            continue;
          }
          if (prevOperator === 'OR' && lastExitCode === 0) {
            continue;
          }
        }

        const pipelineRes = await this.executePipeline(chain.pipeline.commands, context);
        lastExitCode = pipelineRes.exitCode;
        context.exitCode = lastExitCode;
        context.env['?'] = String(lastExitCode);

        finalStdout += pipelineRes.stdout;
        finalStderr += pipelineRes.stderr;
      }

      return {
        stdout: finalStdout,
        stderr: finalStderr,
        exitCode: lastExitCode,
      };
    } catch (err) {
      return {
        stdout: '',
        stderr: `aesh: error executing command: ${(err as Error).message}\n`,
        exitCode: 1,
      };
    }
  }

  private async executePipeline(
    commands: SimpleCommand[],
    context: ShellContext
  ): Promise<ExecutionResult> {
    let currentStdin = '';
    let pipelineStdout = '';
    let pipelineStderr = '';
    let lastExit = 0;

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const isLast = i === commands.length - 1;

      // Handle variable expansion on command name
      let cmdName = expandVariables(cmd.name, context);
      let initialArgs = [...cmd.args];

      if (context.aliases[cmdName]) {
        const aliasTokens = tokenize(context.aliases[cmdName]);
        if (aliasTokens.length > 0 && aliasTokens[0].type === 'WORD') {
          cmdName = aliasTokens[0].value;
          const extraArgs = aliasTokens.slice(1).map((t) => t.value);
          initialArgs = [...extraArgs, ...initialArgs];
        }
      }

      // Variable expansion
      const expandedArgs: string[] = [];
      for (const arg of initialArgs) {
        const expanded = expandVariables(arg, context);
        // Glob expansion
        const globs = expandGlobs(expanded, context.cwd);
        expandedArgs.push(...globs);
      }

      // Input redirection
      let stdinData = currentStdin;
      for (const r of cmd.redirections) {
        if (r.type === 'in') {
          const inPath = vfs.resolve(context.cwd, expandVariables(r.target, context));
          try {
            stdinData = vfs.readFile(inPath);
          } catch {
            return { stdout: '', stderr: `aesh: ${r.target}: No such file or directory\n`, exitCode: 1 };
          }
        }
      }

      // Execute simple command
      const res = await this.executeSingleCommand(cmdName, expandedArgs, context, stdinData);
      lastExit = res.exitCode;

      // Output redirection
      let cmdStdout = res.stdout;
      let cmdStderr = res.stderr;

      for (const r of cmd.redirections) {
        const targetPath = vfs.resolve(context.cwd, expandVariables(r.target, context));
        if (r.type === 'out') {
          vfs.writeFile(targetPath, cmdStdout, { owner: context.user });
          cmdStdout = '';
        } else if (r.type === 'append') {
          vfs.appendFile(targetPath, cmdStdout);
          cmdStdout = '';
        } else if (r.type === 'err') {
          vfs.writeFile(targetPath, cmdStderr, { owner: context.user });
          cmdStderr = '';
        }
      }

      if (isLast) {
        pipelineStdout += cmdStdout;
      } else {
        currentStdin = cmdStdout;
      }
      pipelineStderr += cmdStderr;
    }

    return {
      stdout: pipelineStdout,
      stderr: pipelineStderr,
      exitCode: lastExit,
    };
  }

  private async executeSingleCommand(
    name: string,
    args: string[],
    context: ShellContext,
    stdin: string
  ): Promise<ExecutionResult> {
    if (!name) {
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    // Check variable assignments like FOO=bar
    if (name.includes('=') && !name.startsWith('/') && !name.startsWith('.')) {
      const eqIdx = name.indexOf('=');
      const varName = name.slice(0, eqIdx);
      const varVal = name.slice(eqIdx + 1);
      context.env[varName] = varVal;
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    // Check built-in command registry
    const registered = commandRegistry.get(name);
    if (registered) {
      // Spawn temporary process for command tracking in kernel
      const proc = virtualKernel.spawn({
        name,
        command: name,
        args,
        user: context.user,
      });

      try {
        const result = await registered.execute(args, context, stdin);
        virtualKernel.exit(proc.pid, result.exitCode);
        return result;
      } catch (err) {
        virtualKernel.exit(proc.pid, 1);
        return {
          stdout: '',
          stderr: `${name}: error: ${(err as Error).message}\n`,
          exitCode: 1,
        };
      }
    }

    // Check if it's an executable script file in VFS
    const scriptPath = vfs.resolve(context.cwd, name);
    if (vfs.exists(scriptPath)) {
      try {
        const scriptStat = vfs.stat(scriptPath);
        if (scriptStat.isFile()) {
          const content = vfs.readFile(scriptPath);
          return await this.executeScript(content, context);
        }
      } catch {
        // Fall through
      }
    }

    return {
      stdout: '',
      stderr: `aesh: ${name}: command not found\n`,
      exitCode: 127,
    };
  }

  /**
   * Execute a multi-line shell script
   */
  public async executeScript(script: string, context: ShellContext): Promise<ExecutionResult> {
    const lines = script.split('\n');
    let out = '';
    let err = '';
    let code = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const res = await this.execute(line, context);
      out += res.stdout;
      err += res.stderr;
      code = res.exitCode;
      if (code !== 0 && script.includes('set -e')) {
        break;
      }
    }

    return { stdout: out, stderr: err, exitCode: code };
  }
}

export const shellExecutor = new ShellExecutor();
