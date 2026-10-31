// AetherOS - Text & Built-in Shell Commands
import type { RegisteredCommand, ExecutionResult } from '../types';
import { commandRegistry } from '../registry';

export const textCommands: RegisteredCommand[] = [
  {
    name: 'echo',
    description: 'Display a line of text',
    usage: 'echo [-n] [-e] [string...]',
    execute: (args): ExecutionResult => {
      let noNewline = false;
      let interpretEscapes = false;
      const words: string[] = [];

      for (const a of args) {
        if (a === '-n') noNewline = true;
        else if (a === '-e') interpretEscapes = true;
        else words.push(a);
      }

      let text = words.join(' ');
      if (interpretEscapes) {
        text = text
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r')
          .replace(/\\e/g, '\x1b');
      }

      return {
        stdout: text + (noNewline ? '' : '\n'),
        stderr: '',
        exitCode: 0,
      };
    },
  },
  {
    name: 'printf',
    description: 'Format and print data',
    usage: 'printf <format> [arguments...]',
    execute: (args): ExecutionResult => {
      if (args.length === 0) return { stdout: '', stderr: '', exitCode: 0 };
      const format = args[0]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\\');

      const formatArgs = args.slice(1);
      let argIndex = 0;
      const formatted = format.replace(/%([%sdf])/g, (match, specifier) => {
        if (specifier === '%') return '%';
        if (argIndex >= formatArgs.length) return '';
        const val = formatArgs[argIndex++];
        if (specifier === 's') return String(val);
        if (specifier === 'd') return String(parseInt(val, 10) || 0);
        if (specifier === 'f') return String(parseFloat(val) || 0);
        return match;
      });

      return { stdout: formatted, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'clear',
    description: 'Clear the terminal screen',
    usage: 'clear',
    execute: (): ExecutionResult => {
      return { stdout: '\x1b[2J\x1b[H', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'history',
    description: 'Display shell command history',
    usage: 'history',
    execute: (_, context): ExecutionResult => {
      const lines = context.history.map((cmd, i) => `${(i + 1).toString().padStart(4, ' ')}  ${cmd}`);
      return { stdout: lines.join('\n') + (lines.length ? '\n' : ''), stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'alias',
    description: 'Define or display aliases',
    usage: 'alias [name[=value]...]',
    execute: (args, context): ExecutionResult => {
      if (args.length === 0) {
        const lines = Object.entries(context.aliases).map(([k, v]) => `alias ${k}='${v}'`);
        return { stdout: lines.join('\n') + (lines.length ? '\n' : ''), stderr: '', exitCode: 0 };
      }

      for (const arg of args) {
        const eqIdx = arg.indexOf('=');
        if (eqIdx !== -1) {
          const name = arg.slice(0, eqIdx);
          let value = arg.slice(eqIdx + 1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          context.aliases[name] = value;
        } else if (context.aliases[arg]) {
          return { stdout: `alias ${arg}='${context.aliases[arg]}'\n`, stderr: '', exitCode: 0 };
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'unalias',
    description: 'Remove alias definitions',
    usage: 'unalias <name...>',
    execute: (args, context): ExecutionResult => {
      for (const name of args) {
        delete context.aliases[name];
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'export',
    description: 'Set export attribute for shell variables',
    usage: 'export [name[=value]...]',
    execute: (args, context): ExecutionResult => {
      if (args.length === 0) {
        const lines = Object.entries(context.env).map(([k, v]) => `declare -x ${k}="${v}"`);
        return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
      }

      for (const arg of args) {
        const eqIdx = arg.indexOf('=');
        if (eqIdx !== -1) {
          const name = arg.slice(0, eqIdx);
          let value = arg.slice(eqIdx + 1);
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          context.env[name] = value;
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'unset',
    description: 'Unset values and attributes of variables and functions',
    usage: 'unset <name...>',
    execute: (args, context): ExecutionResult => {
      for (const name of args) {
        delete context.env[name];
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'env',
    description: 'Print environment variables',
    usage: 'env',
    execute: (_, context): ExecutionResult => {
      const lines = Object.entries(context.env).map(([k, v]) => `${k}=${v}`);
      return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'printenv',
    description: 'Print all or part of environment',
    usage: 'printenv [variable]',
    execute: (args, context): ExecutionResult => {
      if (args.length > 0) {
        const val = context.env[args[0]];
        return val !== undefined ? { stdout: val + '\n', stderr: '', exitCode: 0 } : { stdout: '', stderr: '', exitCode: 1 };
      }
      const lines = Object.entries(context.env).map(([k, v]) => `${k}=${v}`);
      return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'which',
    description: 'Locate a command',
    usage: 'which <command...>',
    execute: (args): ExecutionResult => {
      if (args.length === 0) return { stdout: '', stderr: '', exitCode: 1 };
      const out: string[] = [];
      let code = 0;
      for (const c of args) {
        if (commandRegistry.has(c)) {
          out.push(`/usr/bin/${c}`);
        } else {
          code = 1;
        }
      }
      return { stdout: out.join('\n') + (out.length ? '\n' : ''), stderr: '', exitCode: code };
    },
  },
  {
    name: 'type',
    description: 'Display information about command type',
    usage: 'type <name...>',
    execute: (args, context): ExecutionResult => {
      const out: string[] = [];
      for (const c of args) {
        if (context.aliases[c]) {
          out.push(`${c} is an alias for ${context.aliases[c]}`);
        } else if (commandRegistry.has(c)) {
          out.push(`${c} is a shell builtin`);
        } else {
          out.push(`type: ${c}: not found`);
        }
      }
      return { stdout: out.join('\n') + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'date',
    description: 'Display the current date and time',
    usage: 'date',
    execute: (): ExecutionResult => {
      return { stdout: new Date().toString() + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'sleep',
    description: 'Delay for a specified amount of time',
    usage: 'sleep <seconds>',
    execute: async (args): Promise<ExecutionResult> => {
      const sec = parseFloat(args[0]) || 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(sec * 1000, 10000)));
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'seq',
    description: 'Print a sequence of numbers',
    usage: 'seq [first [step]] last',
    execute: (args): ExecutionResult => {
      if (args.length === 0) return { stdout: '', stderr: 'seq: missing operand\n', exitCode: 1 };
      let start = 1;
      let step = 1;
      let end = 1;

      if (args.length === 1) {
        end = parseInt(args[0], 10);
      } else if (args.length === 2) {
        start = parseInt(args[0], 10);
        end = parseInt(args[1], 10);
      } else if (args.length >= 3) {
        start = parseInt(args[0], 10);
        step = parseInt(args[1], 10);
        end = parseInt(args[2], 10);
      }

      if (isNaN(start) || isNaN(end) || isNaN(step) || step === 0) {
        return { stdout: '', stderr: 'seq: invalid argument\n', exitCode: 1 };
      }

      const res: number[] = [];
      const limit = Math.min(Math.abs(end - start) + 1, 1000);
      let curr = start;
      for (let i = 0; i < limit && (step > 0 ? curr <= end : curr >= end); i++) {
        res.push(curr);
        curr += step;
      }

      return { stdout: res.join('\n') + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'yes',
    description: 'Output a string repeatedly until interrupted',
    usage: 'yes [string]',
    execute: (args): ExecutionResult => {
      // Safe bounded repetition in browser
      const word = args[0] || 'y';
      const out = Array.from({ length: 50 }, () => word).join('\n') + '\n';
      return { stdout: out, stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'true',
    description: 'Do nothing, successfully',
    usage: 'true',
    execute: (): ExecutionResult => ({ stdout: '', stderr: '', exitCode: 0 }),
  },
  {
    name: 'false',
    description: 'Do nothing, unsuccessfully',
    usage: 'false',
    execute: (): ExecutionResult => ({ stdout: '', stderr: '', exitCode: 1 }),
  },
  {
    name: 'help',
    description: 'Display information about built-in commands',
    usage: 'help [pattern]',
    execute: (): ExecutionResult => {
      const cmds = commandRegistry.getAll();
      const lines = [
        '\x1b[1;36mAetherOS aesh Shell built-in commands:\x1b[0m',
        '---------------------------------------',
      ];
      for (const cmd of cmds) {
        lines.push(`  \x1b[1;32m${cmd.name.padEnd(12, ' ')}\x1b[0m ${cmd.description}`);
      }
      lines.push('\nUse `man <command>` for detailed manual pages.');
      return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
    },
  },
  {
    name: 'man',
    description: 'An interface to the system reference manuals',
    usage: 'man <command>',
    execute: (args): ExecutionResult => {
      if (args.length === 0) {
        return { stdout: '', stderr: 'What manual page do you want?\n', exitCode: 1 };
      }
      const cmd = commandRegistry.get(args[0]);
      if (!cmd) {
        return { stdout: '', stderr: `No manual entry for ${args[0]}\n`, exitCode: 1 };
      }

      const man = [
        `\x1b[1mNAME\x1b[0m\n    ${cmd.name} - ${cmd.description}\n`,
        `\x1b[1mSYNOPSIS\x1b[0m\n    ${cmd.usage}\n`,
        `\x1b[1mDESCRIPTION\x1b[0m\n    ${cmd.manual || cmd.description}\n`,
      ];
      return { stdout: man.join('\n'), stderr: '', exitCode: 0 };
    },
  },
];
