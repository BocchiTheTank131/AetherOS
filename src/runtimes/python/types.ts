// AetherOS - Python Runtime Types & Interfaces

export interface PythonExecutionOptions {
  code: string;
  filename?: string;
  cwd?: string;
  args?: string[];
  timeoutMs?: number;
  files?: Record<string, Uint8Array | string>;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onStatus?: (status: string) => void;
}

export interface PythonExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  modifiedFiles: Record<string, Uint8Array>;
  timedOut?: boolean;
}

export interface PythonWorkerMessage {
  type: 'execute' | 'cancel' | 'init';
  code?: string;
  filename?: string;
  args?: string[];
  cwd?: string;
  files?: Record<string, Uint8Array | string>;
}

export interface PythonHostMessage {
  type: 'stdout' | 'stderr' | 'status' | 'exit' | 'sync_files';
  text?: string;
  message?: string;
  exitCode?: number;
  files?: Record<string, Uint8Array>;
}
