// AetherOS - Python Runtime Coordinator
import { PythonSession } from './PythonSession';
import type { PythonExecutionOptions, PythonExecutionResult } from './types';
import { PYODIDE_VERSION } from './pythonWorkerSource';

export class PythonRuntime {
  public readonly version = `Python 3.12.1 (Pyodide ${PYODIDE_VERSION})`;
  private activeSessions = new Map<string, PythonSession>();
  private pidToSession = new Map<number, PythonSession>();
  private maxConcurrentSessions = 5;

  public createSession(commandName = 'python'): PythonSession {
    if (this.activeSessions.size >= this.maxConcurrentSessions) {
      throw new Error(`Maximum concurrent Python sessions reached (${this.maxConcurrentSessions})`);
    }

    const session = new PythonSession(commandName, (id, pid) => {
      this.activeSessions.delete(id);
      this.pidToSession.delete(pid);
    });

    this.activeSessions.set(session.id, session);
    this.pidToSession.set(session.pid, session);
    return session;
  }

  public async execute(options: PythonExecutionOptions): Promise<PythonExecutionResult> {
    const session = this.createSession(`python ${options.filename || 'script.py'}`);
    try {
      return await session.execute(options);
    } finally {
      this.activeSessions.delete(session.id);
      this.pidToSession.delete(session.pid);
    }
  }

  public getSessionByPid(pid: number): PythonSession | undefined {
    return this.pidToSession.get(pid);
  }

  public cancel(pid: number): boolean {
    const session = this.pidToSession.get(pid);
    if (session) {
      session.cancel();
      this.activeSessions.delete(session.id);
      this.pidToSession.delete(pid);
      return true;
    }
    return false;
  }

  public getActiveCount(): number {
    return this.activeSessions.size;
  }
}

export const pythonRuntime = new PythonRuntime();
