// AetherOS - Aether Shell (aesh) Types

export type TokenType =
  | 'WORD'
  | 'PIPE' // |
  | 'REDIRECT_OUT' // >
  | 'REDIRECT_APPEND' // >>
  | 'REDIRECT_IN' // <
  | 'REDIRECT_ERR' // 2>
  | 'AND' // &&
  | 'OR' // ||
  | 'SEMICOLON' // ;
  | 'NEWLINE';

export interface Token {
  type: TokenType;
  value: string;
}

export interface Redirection {
  type: 'out' | 'append' | 'in' | 'err';
  target: string;
}

export interface SimpleCommand {
  name: string;
  args: string[];
  redirections: Redirection[];
}

export interface Pipeline {
  commands: SimpleCommand[];
}

export type LogicalOperator = 'AND' | 'OR' | 'THEN';

export interface CommandChain {
  pipeline: Pipeline;
  operator?: LogicalOperator;
}

export interface ShellContext {
  cwd: string;
  env: Record<string, string>;
  aliases: Record<string, string>;
  history: string[];
  exitCode: number;
  user: string;
  hostname: string;
  aborted?: boolean;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ShellCommandFn = (
  args: string[],
  context: ShellContext,
  stdin: string
) => Promise<ExecutionResult> | ExecutionResult;

export interface RegisteredCommand {
  name: string;
  description: string;
  usage: string;
  execute: ShellCommandFn;
  manual?: string;
}
