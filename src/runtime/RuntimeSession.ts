import { createIsolatedWorker } from './workers/isolatedWorker';
// AetherOS - Runtime Execution Session Management
import type { RuntimePermissions } from './RuntimePermissions';
import { checkRuntimePathAccess } from './RuntimePermissions';
import type { RuntimeLimits } from './RuntimeLimits';
import { DEFAULT_RUNTIME_LIMITS } from './RuntimeLimits';
import type { GuestToHostMessage } from './RuntimeProtocol';
import { SANDBOX_WORKER_CODE } from './workers/sandboxSource';
import { hasControlCharacters, withoutSymlinks } from '../vfs/safePath';
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
  ppid?: number;
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

  private worker: ReturnType<typeof createIsolatedWorker> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private permissions: RuntimePermissions;
  private limits: RuntimeLimits;
  private startTime = 0;
  private streams: Pick<RuntimeSessionOptions, 'onStdout' | 'onStderr'>;
  private resolveExecution?: (res: RuntimeExecutionResult) => void;
  private onComplete?: (sessionId: string, pid: number) => void;

  constructor(options: RuntimeSessionOptions) {
    this.id = options.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.permissions = options.permissions;
    this.streams = { onStdout: options.onStdout, onStderr: options.onStderr };
    this.limits = { ...DEFAULT_RUNTIME_LIMITS, ...options.limits };
    this.onComplete = options.onComplete;

    // Register with Virtual Kernel
    const proc = virtualKernel.spawn({
      name: options.commandName || 'js-runtime',
      command: options.commandName || 'js-runtime',
      user: 'aether',
      ppid: options.ppid,
      cleanup: (code) => this.cancel(code),
    });
    this.pid = proc.pid;
  }

  public async execute(code: string, options?: { args?: string[]; onStdout?: (c: string) => void; onStderr?: (c: string) => void }): Promise<RuntimeExecutionResult> {
    if (this.status !== 'pending') throw new Error('Runtime sessions are single-use');
    this.status = 'running';
    this.startTime = performance.now();

    return new Promise((resolve) => {
      this.resolveExecution = resolve;

      // Start execution timeout
      this.timer = setTimeout(() => {
        this.handleTimeout();
      }, this.limits.timeoutMs);

      this.runInWorker(code, {
        ...options,
        onStdout: options?.onStdout ?? this.streams.onStdout,
        onStderr: options?.onStderr ?? this.streams.onStderr,
      });
    });
  }

  private runInWorker(code: string, options?: { args?: string[]; onStdout?: (c: string) => void; onStderr?: (c: string) => void }): void {
    try {
      this.worker = createIsolatedWorker(SANDBOX_WORKER_CODE);

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

  private async handleFsRequest(req: { id: string; method: string; path: string; content?: string; bytesBase64?: string }): Promise<void> {
    const { id, method, path } = req;
    let normPath: string;
    try {
      if (typeof path !== 'string' || !path.startsWith('/') || path.length > 1024 || (path.includes('\\') || hasControlCharacters(path))) throw new Error('Invalid path');
      normPath = withoutSymlinks(path);
    } catch (error) {
      this.worker?.postMessage({ type: 'fs_response', id, error: String(error) });
      return;
    }
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
      if ((req.content !== undefined && (typeof req.content !== 'string' || req.content.length > this.limits.maxOutputBytes)) ||
          (req.bytesBase64 !== undefined && (typeof req.bytesBase64 !== 'string' || req.bytesBase64.length > this.limits.maxOutputBytes * 2))) {
        throw new Error('Filesystem request exceeds payload limit');
      }
      if (!isWrite && method !== 'exists' && vfs.stat(normPath).size > this.limits.maxOutputBytes) {
        throw new Error('File exceeds runtime read limit');
      }
      if (isWrite && !vfs.checkAccess(normPath, 'w')) throw new Error('Permission denied by AetherFS');
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
        const { isDirectory, isFile: _isFile, isSymbolicLink, ...stat } = vfs.stat(normPath);
        result = { ...stat, type: isDirectory() ? 'dir' : isSymbolicLink() ? 'symlink' : 'file' };
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

  public cancel(exitCode = 130): void {
    if (this.status !== 'running' && this.status !== 'pending') return;
    this.status = 'cancelled';
    this.cleanup();

    const cancelMsg = '^C\n';
    this.stderrBuffer += cancelMsg;
    this.finish(exitCode);
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
