// AetherOS - Runtime Execution Session Management
import type { RuntimePermissions } from './RuntimePermissions';
import { checkRuntimePathAccess } from './RuntimePermissions';
import type { RuntimeLimits } from './RuntimeLimits';
import { DEFAULT_RUNTIME_LIMITS } from './RuntimeLimits';
import type { GuestToHostMessage } from './RuntimeProtocol';
import { SANDBOX_WORKER_CODE } from './workers/sandboxSource';
import { vfs } from '../vfs/vfs';
import { virtualKernel } from '../core/kernel';
import { systemLogger } from '../core/logger';

export interface RuntimeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  result?: unknown;
  durationMs: number;
}

export interface RuntimeSessionOptions {
  sessionId?: string;
  commandName?: string;
  args?: string[];
  permissions: RuntimePermissions;
  limits?: Partial<RuntimeLimits>;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onComplete?: (sessionId: string, pid: number) => void;
}

export class RuntimeSession {
  public readonly id: string;
  public readonly pid: number;
  public status: 'pending' | 'running' | 'completed' | 'timeout' | 'cancelled' | 'error' = 'pending';

  private worker: Worker | null = null;
  private workerBlobUrl: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private permissions: RuntimePermissions;
  private limits: RuntimeLimits;
  private startTime = 0;
  private resolveExecution?: (res: RuntimeExecutionResult) => void;
  private onComplete?: (sessionId: string, pid: number) => void;

  constructor(options: RuntimeSessionOptions) {
    this.id = options.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.permissions = options.permissions;
    this.limits = { ...DEFAULT_RUNTIME_LIMITS, ...options.limits };
    this.onComplete = options.onComplete;

    // Register with Virtual Kernel
    const proc = virtualKernel.spawn({
      name: options.commandName || 'js-runtime',
      command: options.commandName || 'js-runtime',
      user: 'aether',
    });
    this.pid = proc.pid;
  }

  public async execute(code: string, options?: { args?: string[]; onStdout?: (c: string) => void; onStderr?: (c: string) => void }): Promise<RuntimeExecutionResult> {
    this.status = 'running';
    this.startTime = performance.now();

    return new Promise((resolve) => {
      this.resolveExecution = resolve;

      // Start execution timeout
      this.timer = setTimeout(() => {
        this.handleTimeout();
      }, this.limits.timeoutMs);

      // Check if Web Worker is available in environment
      if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
        this.runInWorker(code, options);
      } else {
        // Fallback for Node/Vitest test runner environments
        this.runInFallback(code, options);
      }
    });
  }

  private runInWorker(code: string, options?: { args?: string[]; onStdout?: (c: string) => void; onStderr?: (c: string) => void }): void {
    try {
      const blob = new Blob([SANDBOX_WORKER_CODE], { type: 'application/javascript' });
      this.workerBlobUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this.workerBlobUrl);

      this.worker.onmessage = async (e: MessageEvent<GuestToHostMessage>) => {
        const msg = e.data;
        if (!msg) return;

        if (msg.type === 'stdout') {
          if (this.stdoutBuffer.length < this.limits.maxOutputBytes) {
            this.stdoutBuffer += msg.text;
          }
          if (options?.onStdout) options.onStdout(msg.text);
        } else if (msg.type === 'stderr') {
          if (this.stderrBuffer.length < this.limits.maxOutputBytes) {
            this.stderrBuffer += msg.text;
          }
          if (options?.onStderr) options.onStderr(msg.text);
        } else if (msg.type === 'fs_request') {
          await this.handleFsRequest(msg);
        } else if (msg.type === 'exit') {
          this.cleanup();
          this.status = msg.exitCode === 0 ? 'completed' : 'error';
          this.finish(msg.exitCode, msg.result);
        }
      };

      this.worker.onerror = (err) => {
        this.cleanup();
        this.status = 'error';
        const errMsg = `RuntimeWorkerError: ${err.message}\n`;
        this.stderrBuffer += errMsg;
        if (options?.onStderr) options.onStderr(errMsg);
        this.finish(1);
      };

      // Send execute command
      this.worker.postMessage({
        type: 'execute',
        code,
        args: options?.args || [],
      });
    } catch (err) {
      this.cleanup();
      this.status = 'error';
      const errMsg = `RuntimeInitError: ${String(err)}\n`;
      this.stderrBuffer += errMsg;
      if (options?.onStderr) options.onStderr(errMsg);
      this.finish(1);
    }
  }

  private async runInFallback(code: string, options?: { args?: string[]; onStdout?: (c: string) => void; onStderr?: (c: string) => void }): Promise<void> {
    const logs: string[] = [];
    const errLogs: string[] = [];

    const mockConsole = {
      log: (...a: unknown[]) => {
        const text = a.map((x) => (typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x))).join(' ') + '\n';
        logs.push(text);
        if (options?.onStdout) options.onStdout(text);
      },
      info: (...a: unknown[]) => {
        const text = '[INFO] ' + a.map((x) => (typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x))).join(' ') + '\n';
        logs.push(text);
        if (options?.onStdout) options.onStdout(text);
      },
      warn: (...a: unknown[]) => {
        const text = '[WARN] ' + a.map((x) => (typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x))).join(' ') + '\n';
        errLogs.push(text);
        if (options?.onStderr) options.onStderr(text);
      },
      error: (...a: unknown[]) => {
        const text = '[ERROR] ' + a.map((x) => (typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x))).join(' ') + '\n';
        errLogs.push(text);
        if (options?.onStderr) options.onStderr(text);
      },
    };

    const guestAether = {
      fs: {
        readText: (path: string) => {
          if (!checkRuntimePathAccess(path, 'read', this.permissions)) {
            throw new Error(`Permission denied: 'filesystem:read' on '${path}'`);
          }
          return vfs.readText(path);
        },
        writeText: (path: string, content: string) => {
          if (!checkRuntimePathAccess(path, 'write', this.permissions)) {
            throw new Error(`Permission denied: 'filesystem:write' on '${path}'`);
          }
          return vfs.writeText(path, content);
        },
        readBytes: (path: string) => {
          if (!checkRuntimePathAccess(path, 'read', this.permissions)) {
            throw new Error(`Permission denied: 'filesystem:read' on '${path}'`);
          }
          return vfs.readBytes(path);
        },
        writeBytes: (path: string, bytes: Uint8Array) => {
          if (!checkRuntimePathAccess(path, 'write', this.permissions)) {
            throw new Error(`Permission denied: 'filesystem:write' on '${path}'`);
          }
          return vfs.writeBytes(path, bytes);
        },
        exists: (path: string) => vfs.exists(path),
        stat: (path: string) => vfs.stat(path),
      },
    };

    const prevAether = (globalThis as Record<string, unknown>).aether;
    (globalThis as Record<string, unknown>).aether = guestAether;

    let timedOut = false;
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      fallbackTimeout = setTimeout(() => {
        timedOut = true;
        reject(new Error('TIMEOUT_LIMIT_REACHED'));
      }, this.limits.timeoutMs);
    });

    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction('aether', 'args', 'console', '"use strict";\n' + code);
      const res = await Promise.race([
        fn(guestAether, options?.args || [], mockConsole),
        timeoutPromise,
      ]);

      if (fallbackTimeout) clearTimeout(fallbackTimeout);

      if (performance.now() - this.startTime >= this.limits.timeoutMs) {
        this.handleTimeout();
        return;
      }

      this.cleanup();
      this.stdoutBuffer = logs.join('');
      this.stderrBuffer = errLogs.join('');
      this.status = 'completed';
      this.finish(0, res);
    } catch (err) {
      if (fallbackTimeout) clearTimeout(fallbackTimeout);

      if (timedOut || (err as Error).message === 'TIMEOUT_LIMIT_REACHED' || performance.now() - this.startTime >= this.limits.timeoutMs) {
        this.handleTimeout();
        return;
      }

      this.cleanup();
      this.stdoutBuffer = logs.join('');
      const errStr = (err as Error).message || String(err);
      this.stderrBuffer = errLogs.join('') + `${errStr}\n`;
      if (options?.onStderr) options.onStderr(`${errStr}\n`);
      this.status = 'error';
      this.finish(1);
    } finally {
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      (globalThis as Record<string, unknown>).aether = prevAether;
    }
  }

  private async handleFsRequest(req: { id: string; method: string; path: string; content?: string; bytesBase64?: string }): Promise<void> {
    const { id, method, path } = req;
    const normPath = vfs.normalizePath(path);
    const isWrite = method.startsWith('write');
    const allowed = checkRuntimePathAccess(normPath, isWrite ? 'write' : 'read', this.permissions);

    if (!allowed) {
      this.worker?.postMessage({
        type: 'fs_response',
        id,
        error: `Permission denied: '${isWrite ? 'filesystem:write' : 'filesystem:read'}' required for '${path}'`,
      });
      return;
    }

    try {
      let result: unknown = null;
      if (method === 'readText') {
        result = await vfs.readText(normPath);
      } else if (method === 'writeText') {
        await vfs.writeText(normPath, req.content ?? '');
        result = true;
      } else if (method === 'readBytes') {
        const bytes = await vfs.readBytes(normPath);
        let bin = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          bin += String.fromCharCode.apply(null, chunk as unknown as number[]);
        }
        result = { base64: btoa(bin) };
      } else if (method === 'writeBytes') {
        const bin = atob(req.bytesBase64 || '');
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        await vfs.writeBytes(normPath, bytes);
        result = true;
      } else if (method === 'exists') {
        result = vfs.exists(normPath);
      } else if (method === 'stat') {
        result = vfs.stat(normPath);
      }

      this.worker?.postMessage({
        type: 'fs_response',
        id,
        result,
      });
    } catch (err) {
      this.worker?.postMessage({
        type: 'fs_response',
        id,
        error: (err as Error).message,
      });
    }
  }

  private handleTimeout(): void {
    if (this.status !== 'running') return;
    this.status = 'timeout';
    this.cleanup();

    const timeoutMsg = `\nAetherRuntime: Execution timed out after ${this.limits.timeoutMs}ms (interrupted)\n`;
    this.stderrBuffer += timeoutMsg;
    systemLogger.warn('runtime', `Runtime session ${this.id} (PID ${this.pid}) timed out`);
    this.finish(124);
  }

  public cancel(): void {
    if (this.status !== 'running') return;
    this.status = 'cancelled';
    this.cleanup();

    const cancelMsg = '^C\n';
    this.stderrBuffer += cancelMsg;
    this.finish(130);
  }

  private cleanup(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }
    if (this.workerBlobUrl) {
      try {
        URL.revokeObjectURL(this.workerBlobUrl);
      } catch {}
      this.workerBlobUrl = null;
    }
  }

  private finish(exitCode: number, result?: unknown): void {
    const durationMs = Math.round(performance.now() - this.startTime);
    virtualKernel.exit(this.pid, exitCode);
    this.onComplete?.(this.id, this.pid);

    if (this.resolveExecution) {
      this.resolveExecution({
        stdout: this.stdoutBuffer,
        stderr: this.stderrBuffer,
        exitCode,
        result,
        durationMs,
      });
    }
  }
}
