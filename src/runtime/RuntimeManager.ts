// AetherOS - Runtime Manager Coordinator
import { RuntimeSession, type RuntimeExecutionResult, type RuntimeSessionOptions } from './RuntimeSession';
import { createDefaultPermissions, type RuntimePermissions } from './RuntimePermissions';
import { DEFAULT_RUNTIME_LIMITS, type RuntimeLimits } from './RuntimeLimits';
import { systemLogger } from '../core/logger';

export class RuntimeManager {
  private activeSessions = new Map<string, RuntimeSession>();
  private pidToSession = new Map<number, RuntimeSession>();
  private limits: RuntimeLimits = { ...DEFAULT_RUNTIME_LIMITS };

  public createSession(options?: Partial<RuntimeSessionOptions>): RuntimeSession {
    if (this.activeSessions.size >= this.limits.maxActiveSessions) {
      throw new Error(`Maximum concurrent runtime sessions reached (${this.limits.maxActiveSessions})`);
    }

    const session = new RuntimeSession({
      commandName: options?.commandName || 'js-runtime',
      args: options?.args,
      permissions: options?.permissions || createDefaultPermissions(),
      limits: options?.limits || this.limits,
      onStdout: options?.onStdout,
      onStderr: options?.onStderr,
      onComplete: (id, pid) => {
        this.activeSessions.delete(id);
        this.pidToSession.delete(pid);
        options?.onComplete?.(id, pid);
      },
    });

    this.activeSessions.set(session.id, session);
    this.pidToSession.set(session.pid, session);
    systemLogger.info('runtime', `Created runtime session ${session.id} with PID ${session.pid}`);

    return session;
  }

  public async execute(
    code: string,
    options?: {
      commandName?: string;
      args?: string[];
      permissions?: RuntimePermissions;
      timeoutMs?: number;
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
    }
  ): Promise<RuntimeExecutionResult> {
    const session = this.createSession({
      commandName: options?.commandName,
      args: options?.args,
      permissions: options?.permissions,
      limits: options?.timeoutMs ? { ...this.limits, timeoutMs: options.timeoutMs } : this.limits,
      onStdout: options?.onStdout,
      onStderr: options?.onStderr,
    });

    try {
      const result = await session.execute(code, {
        args: options?.args,
        onStdout: options?.onStdout,
        onStderr: options?.onStderr,
      });
      return result;
    } finally {
      this.activeSessions.delete(session.id);
      this.pidToSession.delete(session.pid);
    }
  }

  public getSessionByPid(pid: number): RuntimeSession | undefined {
    return this.pidToSession.get(pid);
  }

  public cancelSession(pid: number): boolean {
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

export const runtimeManager = new RuntimeManager();
