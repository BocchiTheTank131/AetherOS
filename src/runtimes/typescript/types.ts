// AetherOS - TypeScript Compiler & Language Service Types

export interface TSDiagnostic {
  file: string;
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
}

export interface TSCompileOptions {
  entryFile?: string;
  sourceCode?: string;
  cwd?: string;
  noEmit?: boolean;
  outDir?: string;
  configPath?: string;
}

export interface TSCompileResult {
  success: boolean;
  diagnostics: TSDiagnostic[];
  outputText?: string;
  outputFiles?: Record<string, string>;
  bundleCode?: string;
}

export interface TSCompletionItem {
  label: string;
  kind: 'keyword' | 'function' | 'variable' | 'class' | 'interface' | 'property' | 'module';
  detail?: string;
  documentation?: string;
}

export interface TSHoverInfo {
  contents: string[];
  range?: { startLine: number; startCol: number; endLine: number; endCol: number };
}

export interface TSDefinitionLocation {
  file: string;
  line: number;
  col: number;
}
