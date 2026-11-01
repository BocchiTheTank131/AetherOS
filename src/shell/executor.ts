// AetherOS - aesh Shell Command & Script Executor (POSIX-like Scripting & Job Control)
import type {
  ShellContext,
  ExecutionResult,
  SimpleCommand,
  Statement,
  CommandChainStatement,
} from './types';
import { tokenize } from './lexer';
import { parseScript } from './parser';
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
      const statements = parseScript(tokens);
      return await this.executeStatements(statements, context);
    } catch (err) {
      return {
        stdout: '',
        stderr: `aesh: error executing command: ${(err as Error).message}\n`,
        exitCode: 1,
      };
    }
  }

  /**
   * Execute AST Statements sequentially, handling control flow, background jobs, and functions
   */
  public async executeStatements(
    stmts: Statement[],
    context: ShellContext
  ): Promise<ExecutionResult> {
    let finalStdout = '';
    let finalStderr = '';
    let lastExitCode = 0;

    for (let i = 0; i < stmts.length; i++) {
      if (context.aborted) {
        finalStderr += '^C\n';
        lastExitCode = 130;
        break;
      }

      const stmt = stmts[i];

      switch (stmt.type) {
        case 'chain': {
          const chain = stmt.chain;

          // Conditional operators from previous statement in this sequence
          if (i > 0 && stmts[i - 1].type === 'chain') {
            const prevOp = (stmts[i - 1] as CommandChainStatement).chain.operator;
            if (prevOp === 'AND' && lastExitCode !== 0) {
              continue;
            }
            if (prevOp === 'OR' && lastExitCode === 0) {
              continue;
            }
          }

          // Background execution (&)
          if (chain.background) {
            if (!context.jobs) {
              context.jobs = new Map();
            }
            const jobId = (context.jobs.size > 0 ? Math.max(...context.jobs.keys()) : 0) + 1;
            const cmdName = chain.pipeline.commands
              .map((c) => c.name + (c.args.length ? ' ' + c.args.join(' ') : ''))
              .join(' | ');

            const proc = virtualKernel.spawn({
              name: chain.pipeline.commands[0]?.name || 'job',
              command: cmdName,
              user: context.user,
            });

            const jobPromise = this.executePipeline(chain.pipeline.commands, context)
              .then((res) => {
                const job = context.jobs?.get(jobId);
                if (job) {
                  job.status = 'done';
                }
                virtualKernel.exit(proc.pid, res.exitCode);
                return res;
              })
              .catch((err) => {
                const job = context.jobs?.get(jobId);
                if (job) {
                  job.status = 'error';
                }
                virtualKernel.exit(proc.pid, 1);
                return {
                  stdout: '',
                  stderr: `aesh: background job ${jobId} failed: ${(err as Error).message}\n`,
                  exitCode: 1,
                };
              });

            context.jobs.set(jobId, {
              id: jobId,
              pid: proc.pid,
              command: cmdName,
              status: 'running',
              startTime: Date.now(),
              resultPromise: jobPromise,
            });

            finalStdout += `[${jobId}] ${proc.pid}\n`;
            lastExitCode = 0;
            context.exitCode = 0;
            context.env['?'] = '0';
            break;
          }

          const pipelineRes = await this.executePipeline(chain.pipeline.commands, context);
          lastExitCode = pipelineRes.exitCode;
          context.exitCode = lastExitCode;
          context.env['?'] = String(lastExitCode);

          finalStdout += pipelineRes.stdout;
          finalStderr += pipelineRes.stderr;
          break;
        }

        case 'if': {
          const testRes = await this.executeStatements(stmt.test, context);
          let handled = false;

          if (testRes.exitCode === 0) {
            const thenRes = await this.executeStatements(stmt.then, context);
            finalStdout += thenRes.stdout;
            finalStderr += thenRes.stderr;
            lastExitCode = thenRes.exitCode;
            handled = true;
          } else if (stmt.elifs && stmt.elifs.length > 0) {
            for (const elif of stmt.elifs) {
              const elifTestRes = await this.executeStatements(elif.test, context);
              if (elifTestRes.exitCode === 0) {
                const elifThenRes = await this.executeStatements(elif.then, context);
                finalStdout += elifThenRes.stdout;
                finalStderr += elifThenRes.stderr;
                lastExitCode = elifThenRes.exitCode;
                handled = true;
                break;
              }
            }
          }

          if (!handled && stmt.else) {
            const elseRes = await this.executeStatements(stmt.else, context);
            finalStdout += elseRes.stdout;
            finalStderr += elseRes.stderr;
            lastExitCode = elseRes.exitCode;
          }

          context.exitCode = lastExitCode;
          context.env['?'] = String(lastExitCode);
          break;
        }

        case 'for': {
          const expandedItems: string[] = [];
          for (const rawItem of stmt.items) {
            const expanded = expandVariables(rawItem, context);
            const globs = expandGlobs(expanded, context.cwd);
            for (const g of globs) {
              if (g.includes(' ') && !rawItem.startsWith('"') && !rawItem.startsWith("'")) {
                expandedItems.push(...g.split(/\s+/).filter(Boolean));
              } else {
                expandedItems.push(g);
              }
            }
          }

          for (const itemVal of expandedItems) {
            if (context.aborted) break;
            context.env[stmt.variable] = itemVal;
            const bodyRes = await this.executeStatements(stmt.body, context);
            finalStdout += bodyRes.stdout;
            finalStderr += bodyRes.stderr;
            lastExitCode = bodyRes.exitCode;
          }

          context.exitCode = lastExitCode;
          context.env['?'] = String(lastExitCode);
          break;
        }

        case 'while': {
          let iterations = 0;
          while (true) {
            if (context.aborted) break;
            if (++iterations % 100 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
            const testRes = await this.executeStatements(stmt.test, context);
            if (testRes.exitCode !== 0) break;

            const bodyRes = await this.executeStatements(stmt.body, context);
            finalStdout += bodyRes.stdout;
            finalStderr += bodyRes.stderr;
            lastExitCode = bodyRes.exitCode;
          }

          context.exitCode = lastExitCode;
          context.env['?'] = String(lastExitCode);
          break;
        }

        case 'case': {
          const targetWord = expandVariables(stmt.word, context);
          for (const arm of stmt.arms) {
            const matches = arm.patterns.some((pat) => {
              const expPat = expandVariables(pat, context);
              if (expPat === '*' || expPat === targetWord) return true;
              try {
                const regexPattern = expPat
                  .replace(/[()+.\\^$|]/g, '\\$&')
                  .replace(/\*/g, '.*')
                  .replace(/\?/g, '.');
                const regex = new RegExp(`^${regexPattern}$`);
                return regex.test(targetWord);
              } catch {
                return false;
              }
            });

            if (matches) {
              const armRes = await this.executeStatements(arm.body, context);
              finalStdout += armRes.stdout;
              finalStderr += armRes.stderr;
              lastExitCode = armRes.exitCode;
              break;
            }
          }

          context.exitCode = lastExitCode;
          context.env['?'] = String(lastExitCode);
          break;
        }

        case 'function': {
          if (!context.functions) {
            context.functions = {};
          }
          context.functions[stmt.name] = stmt.body;
          lastExitCode = 0;
          context.exitCode = 0;
          context.env['?'] = '0';
          break;
        }
      }

      if (context.env['ERREXIT'] === '1' && lastExitCode !== 0) {
        break;
      }
    }

    return {
      stdout: finalStdout,
      stderr: finalStderr,
      exitCode: lastExitCode,
    };
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

      // Variable expansion on command name
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

      // Variable and glob expansion on arguments
      const expandedArgs: string[] = [];
      for (const arg of initialArgs) {
        const expanded = expandVariables(arg, context);
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
            return {
              stdout: '',
              stderr: `aesh: ${r.target}: No such file or directory\n`,
              exitCode: 1,
            };
          }
        }
      }

      // Execute single command
      const res = await this.executeSingleCommand(cmdName, expandedArgs, context, stdinData);
      lastExit = res.exitCode;

      // Output redirection
      let cmdStdout = res.stdout;
      let cmdStderr = res.stderr;

      for (const r of cmd.redirections) {
        const targetPath = vfs.resolve(context.cwd, expandVariables(r.target, context));
        try {
          if (r.type === 'out') {
            vfs.writeFile(targetPath, cmdStdout, {
              owner: context.user,
              context: {
                username: context.user,
                uid: context.user === 'root' ? 0 : 1000,
                gid: context.user === 'root' ? 0 : 1000,
              },
            });
            cmdStdout = '';
          } else if (r.type === 'append') {
            vfs.appendFile(targetPath, cmdStdout);
            cmdStdout = '';
          } else if (r.type === 'err') {
            vfs.writeFile(targetPath, cmdStderr, {
              owner: context.user,
              context: {
                username: context.user,
                uid: context.user === 'root' ? 0 : 1000,
                gid: context.user === 'root' ? 0 : 1000,
              },
            });
            cmdStderr = '';
          }
        } catch (err) {
          return {
            stdout: '',
            stderr: `aesh: ${r.target}: ${(err as Error).message}\n`,
            exitCode: 1,
          };
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

    // Built-in 'set' command for errexit
    if (name === 'set') {
      if (args.includes('-e')) context.env['ERREXIT'] = '1';
      if (args.includes('+e')) delete context.env['ERREXIT'];
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    // Check user-defined function in context.functions
    if (context.functions && context.functions[name]) {
      const fnBody = context.functions[name];
      const savedPositional = context.positionalArgs ? [...context.positionalArgs] : undefined;
      const savedNumbered: Record<string, string> = {};
      for (let k = 1; k <= 9; k++) {
        savedNumbered[String(k)] = context.env[String(k)] || '';
      }
      const savedHash = context.env['#'];
      const savedAt = context.env['@'];
      const savedStar = context.env['*'];

      context.positionalArgs = args;
      context.env['#'] = String(args.length);
      context.env['@'] = args.join(' ');
      context.env['*'] = args.join(' ');
      for (let k = 1; k <= 9; k++) {
        context.env[String(k)] = args[k - 1] ?? '';
      }

      try {
        return await this.executeStatements(fnBody, context);
      } finally {
        context.positionalArgs = savedPositional;
        for (let k = 1; k <= 9; k++) {
          if (savedNumbered[String(k)]) {
            context.env[String(k)] = savedNumbered[String(k)];
          } else {
            delete context.env[String(k)];
          }
        }
        if (savedHash !== undefined) context.env['#'] = savedHash;
        else delete context.env['#'];
        if (savedAt !== undefined) context.env['@'] = savedAt;
        else delete context.env['@'];
        if (savedStar !== undefined) context.env['*'] = savedStar;
        else delete context.env['*'];
      }
    }

    // Check built-in command registry
    const registered = commandRegistry.get(name);
    if (registered) {
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
    let scriptPath: string | null = null;
    if (name.includes('/')) {
      const candidate = vfs.resolve(context.cwd, name);
      if (vfs.exists(candidate)) {
        try {
          const s = vfs.stat(candidate);
          if (s.isFile()) {
            const content = vfs.readFile(candidate);
            const isExecutable =
              (s.permissions & 0o111) !== 0 ||
              candidate.endsWith('.js') ||
              candidate.endsWith('.sh') ||
              content.startsWith('#!');
            if (isExecutable) {
              scriptPath = candidate;
            }
          }
        } catch {}
      }
    } else {
      const pathDirs = (context.env['PATH'] || '/bin:/usr/bin').split(':').filter(Boolean);
      for (const dir of pathDirs) {
        const candidate = vfs.resolve(dir, name);
        if (vfs.exists(candidate)) {
          try {
            const s = vfs.stat(candidate);
            if (s.isFile()) {
              const content = vfs.readFile(candidate);
              const isExecutable =
                (s.permissions & 0o111) !== 0 ||
                candidate.endsWith('.js') ||
                candidate.endsWith('.sh') ||
                content.startsWith('#!');
              if (isExecutable) {
                scriptPath = candidate;
                break;
              }
            }
          } catch {}
        }
      }
    }

    if (scriptPath) {
      try {
        const content = vfs.readFile(scriptPath);

        // Check shebang for node/js runtime
        if (
          content.startsWith('#!/bin/node') ||
          content.startsWith('#!/usr/bin/env node') ||
          content.startsWith('#!/bin/js') ||
          scriptPath.endsWith('.js')
        ) {
          const { aetherRuntime } = await import('../runtime/AetherRuntime');
          const runRes = await aetherRuntime.execute(
            content.replace(/^#!.*\n/, ''),
            {
              commandName: name,
              args,
            }
          );
          return {
            stdout: runRes.stdout,
            stderr: runRes.stderr,
            exitCode: runRes.exitCode,
          };
        }

        return await this.executeScript(content, context, args, scriptPath);
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
   * Execute a shell script with positional arguments ($0..$9, $#, $@, $*)
   */
  public async executeScript(
    script: string,
    context: ShellContext,
    args: string[] = [],
    scriptPath?: string
  ): Promise<ExecutionResult> {
    const savedScript = context.scriptName;
    const savedPositional = context.positionalArgs ? [...context.positionalArgs] : undefined;
    const saved0 = context.env['0'];
    const savedNumbered: Record<string, string> = {};
    for (let k = 1; k <= 9; k++) {
      savedNumbered[String(k)] = context.env[String(k)] || '';
    }
    const savedHash = context.env['#'];
    const savedAt = context.env['@'];
    const savedStar = context.env['*'];

    const hasArgs = args && args.length > 0;
    if (scriptPath) {
      context.scriptName = scriptPath;
      context.env['0'] = scriptPath;
    }
    if (hasArgs) {
      context.positionalArgs = args;
      context.env['#'] = String(args.length);
      context.env['@'] = args.join(' ');
      context.env['*'] = args.join(' ');
      for (let k = 1; k <= 9; k++) {
        context.env[String(k)] = args[k - 1] ?? '';
      }
    }

    try {
      const cleanScript = script.replace(/^#!.*\n/, '');
      const tokens = tokenize(cleanScript);
      const stmts = parseScript(tokens);
      return await this.executeStatements(stmts, context);
    } finally {
      if (hasArgs) {
        context.positionalArgs = savedPositional;
        for (let k = 1; k <= 9; k++) {
          if (savedNumbered[String(k)]) {
            context.env[String(k)] = savedNumbered[String(k)];
          } else {
            delete context.env[String(k)];
          }
        }
        if (savedHash !== undefined) context.env['#'] = savedHash;
        else delete context.env['#'];
        if (savedAt !== undefined) context.env['@'] = savedAt;
        else delete context.env['@'];
        if (savedStar !== undefined) context.env['*'] = savedStar;
        else delete context.env['*'];
      }
      context.scriptName = savedScript;
      if (saved0 !== undefined) context.env['0'] = saved0;
      else delete context.env['0'];
    }
  }
}

export const shellExecutor = new ShellExecutor();
