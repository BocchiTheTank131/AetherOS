import { createIsolatedWorker } from '../../runtime/workers/isolatedWorker';
// AetherOS - Python Execution Session Manager (Pyodide & AetherFS)
import { virtualKernel } from '../../core/kernel';
import { systemLogger } from '../../core/logger';
import { PYODIDE_CDN_BASE, PYTHON_WORKER_CODE } from './pythonWorkerSource';
import { PythonFileBridge } from './PythonFileBridge';
import type { PythonExecutionOptions, PythonExecutionResult, PythonHostMessage } from './types';

export class PythonSession {
  public readonly id: string;
  public readonly pid: number;
  public status: 'pending' | 'running' | 'completed' | 'timeout' | 'cancelled' | 'error' = 'pending';

  private worker: ReturnType<typeof createIsolatedWorker> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private modifiedFiles: Record<string, Uint8Array> = {};
  private signal?: AbortSignal;
  private abort = () => this.cancel();
  private startTime = 0;
  private resolveExecution?: (res: PythonExecutionResult) => void;
  private onComplete?: (sessionId: string, pid: number) => void;

  constructor(commandName = 'python', onComplete?: (id: string, pid: number) => void) {
    this.id = `py_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.onComplete = onComplete;

    const proc = virtualKernel.spawn({
      name: 'python',
      command: commandName,
      user: 'aether',
      cleanup: (code) => this.cancel(code),
    });
    this.pid = proc.pid;
  }

  public async execute(options: PythonExecutionOptions): Promise<PythonExecutionResult> {
    if (this.status !== 'pending') throw new Error('Python sessions are single-use');
    this.status = 'running';
    this.startTime = performance.now();
    const timeoutMs = options.timeoutMs || 30000;
    const cwd = options.cwd || '/home/aether/Projects';
    const filename = options.filename || 'script.py';

    return new Promise((resolve) => {
      this.resolveExecution = resolve;
      if (options.signal?.aborted) {
        this.cancel();
        return;
      }
      options.signal?.addEventListener('abort', this.abort, { once: true });
      this.signal = options.signal;

      this.timer = setTimeout(() => {
        this.handleTimeout();
      }, timeoutMs);

      this.runInWorker(options, cwd, filename);
    });
  }

  private runInWorker(options: PythonExecutionOptions, cwd: string, filename: string): void {
    try {
      this.worker = createIsolatedWorker(PYTHON_WORKER_CODE, new URL(PYODIDE_CDN_BASE).origin);

      // Load files from AetherFS
      const projectFiles = options.files || PythonFileBridge.loadProjectFiles(cwd);

      this.worker.onmessage = async (e: MessageEvent<PythonHostMessage>) => {
        if (this.status !== 'running') return;
        const msg = e.data;
        if (!msg) return;

        if (msg.type === 'stdout' && msg.text) {
          this.stdoutBuffer += msg.text;
          options.onStdout?.(msg.text);
        } else if (msg.type === 'stderr' && msg.text) {
          this.stderrBuffer += msg.text;
          options.onStderr?.(msg.text);
        } else if (msg.type === 'status' && msg.message) {
          options.onStatus?.(msg.message);
        } else if (msg.type === 'sync_files' && msg.files) {
          this.modifiedFiles = msg.files;
        } else if (msg.type === 'exit') {
          let exitCode = msg.exitCode ?? 1;
          if (exitCode === 0) {
            try {
              await PythonFileBridge.commitFiles(cwd, this.modifiedFiles);
            } catch (error) {
              this.stderrBuffer += String(error) + '\n';
              exitCode = 1;
            }
          }
          if (this.status !== 'running') return;
          this.cleanup();
          this.status = exitCode === 0 ? 'completed' : 'error';
          this.finish(exitCode);
        }
      };

      this.worker.onerror = (err) => {
        const errMsg = `PythonWorkerError: ${err.message}\n`;
        this.stderrBuffer += errMsg;
        options.onStderr?.(errMsg);
        this.cleanup();
        this.status = 'error';
        this.finish(1);
      };

      this.worker.postMessage({
        type: 'execute',
        code: options.code,
        filename,
        args: options.args || [],
        cwd,
        files: projectFiles,
      });
    } catch (error) {
      this.stderrBuffer += `Python runtime unavailable: ${String(error)}\n`;
      this.status = 'error';
      this.cleanup();
      this.finish(1);
    }
  }

  public cancel(exitCode = 130): void {
    if (this.status !== 'running' && this.status !== 'pending') return;
    this.status = 'cancelled';
    this.cleanup();
    this.stderrBuffer += '^C\n';
    this.finish(exitCode);
  }

  private handleTimeout(): void {
    if (this.status !== 'running') return;
    this.cleanup();
    this.status = 'timeout';
    this.stderrBuffer += 'Execution timeout: Python process exceeded execution limit (exit code 124)\n';
    this.finish(124, true);
  }

  private cleanup(): void {
    this.signal?.removeEventListener('abort', this.abort);
    this.signal = undefined;
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

  private finish(exitCode: number, timedOut = false): void {
    const durationMs = Math.round(performance.now() - this.startTime);
    virtualKernel.exit(this.pid, exitCode);
    systemLogger.info('python', `Python process PID ${this.pid} exited with code ${exitCode} (${durationMs}ms)`);

    this.onComplete?.(this.id, this.pid);

    if (this.resolveExecution) {
      this.resolveExecution({
        stdout: this.stdoutBuffer,
        stderr: this.stderrBuffer,
        exitCode,
        durationMs,
        modifiedFiles: this.modifiedFiles,
        timedOut,
      });
      this.resolveExecution = undefined;
    }
  }
}
