// AetherOS - Aether Shell (aesh) Types (v1.2.0)

export type TokenType =
  | 'WORD'
  | 'PIPE' // |
  | 'REDIRECT_OUT' // >
  | 'REDIRECT_APPEND' // >>
  | 'REDIRECT_IN' // <
  | 'REDIRECT_ERR' // 2>
  | 'AND' // &&
  | 'OR' // ||
  | 'AMPERSAND' // &
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
  background?: boolean;
}

// POSIX-like Scripting AST Nodes
export interface CommandChainStatement {
  type: 'chain';
  chain: CommandChain;
}

export interface IfStatement {
  type: 'if';
  test: Statement[];
  then: Statement[];
  elifs?: Array<{ test: Statement[]; then: Statement[] }>;
  else?: Statement[];
}

export interface ForStatement {
  type: 'for';
  variable: string;
  items: string[];
  body: Statement[];
}

export interface WhileStatement {
  type: 'while';
  test: Statement[];
  body: Statement[];
}

export interface CaseArm {
  patterns: string[];
  body: Statement[];
}

export interface CaseStatement {
  type: 'case';
  word: string;
  arms: CaseArm[];
}

export interface FunctionDefStatement {
  type: 'function';
  name: string;
  body: Statement[];
}

export type Statement =
  | CommandChainStatement
  | IfStatement
  | ForStatement
  | WhileStatement
  | CaseStatement
  | FunctionDefStatement;

export interface ShellJob {
  id: number;
  pid: number;
  command: string;
  status: 'running' | 'stopped' | 'done';
  startTime: number;
  resultPromise?: Promise<ExecutionResult>;
}

export interface ShellContext {
  cwd: string;
  env: Record<string, string>;
  aliases: Record<string, string>;
  functions?: Record<string, Statement[]>;
  history: string[];
  exitCode: number;
  user: string;
  hostname: string;
  aborted?: boolean;
  scriptName?: string;
  positionalArgs?: string[];
  jobs?: Map<number, ShellJob>;
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
