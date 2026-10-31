// AetherOS - Runtime Specific Error Classes

export class RuntimeError extends Error {
  public exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'RuntimeError';
    this.exitCode = exitCode;
  }
}

export class RuntimeTimeoutError extends RuntimeError {
  constructor(timeoutMs: number) {
    super(`Execution timed out after ${timeoutMs}ms (interrupted)`, 124);
    this.name = 'RuntimeTimeoutError';
  }
}

export class RuntimeSecurityError extends RuntimeError {
  constructor(permission: string, path?: string) {
    super(
      `Permission denied: operation requires '${permission}'${path ? ` on '${path}'` : ''}`,
      126
    );
    this.name = 'RuntimeSecurityError';
  }
}
