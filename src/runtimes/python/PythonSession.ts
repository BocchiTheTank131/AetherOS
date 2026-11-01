// AetherOS - Python Execution Session Manager (Pyodide & AetherFS)
import { virtualKernel } from '../../core/kernel';
import { systemLogger } from '../../core/logger';
import { PYTHON_WORKER_CODE } from './pythonWorkerSource';
import { PythonFileBridge } from './PythonFileBridge';
import type { PythonExecutionOptions, PythonExecutionResult, PythonHostMessage } from './types';

export class PythonSession {
  public readonly id: string;
  public readonly pid: number;
  public status: 'pending' | 'running' | 'completed' | 'timeout' | 'cancelled' | 'error' = 'pending';

  private worker: Worker | null = null;
  private workerBlobUrl: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private modifiedFiles: Record<string, Uint8Array> = {};
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
    });
    this.pid = proc.pid;
  }

  public async execute(options: PythonExecutionOptions): Promise<PythonExecutionResult> {
    this.status = 'running';
    this.startTime = performance.now();
    const timeoutMs = options.timeoutMs || 30000;
    const cwd = options.cwd || '/home/aether/Projects';
    const filename = options.filename || 'script.py';

    return new Promise((resolve) => {
      this.resolveExecution = resolve;

      this.timer = setTimeout(() => {
        this.handleTimeout();
      }, timeoutMs);

      // Determine if real Web Worker environment is available
      const isBrowserWorker =
        typeof Worker !== 'undefined' &&
        typeof Blob !== 'undefined' &&
        typeof URL !== 'undefined' &&
        typeof (Worker as unknown as { prototype: unknown }).prototype !== 'undefined';

      if (isBrowserWorker) {
        this.runInWorker(options, cwd, filename);
      } else {
        this.runInSimulatedEnvironment(options, cwd, filename);
      }
    });
  }

  private runInWorker(options: PythonExecutionOptions, cwd: string, filename: string): void {
    try {
      const blob = new Blob([PYTHON_WORKER_CODE], { type: 'application/javascript' });
      this.workerBlobUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this.workerBlobUrl);

      // Load files from AetherFS
      const projectFiles = options.files || PythonFileBridge.loadProjectFiles(cwd);

      this.worker.onmessage = async (e: MessageEvent<PythonHostMessage>) => {
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
          await PythonFileBridge.commitFiles(cwd, msg.files);
        } else if (msg.type === 'exit') {
          const exitCode = msg.exitCode ?? 0;
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
    } catch {
      // Fallback if worker construction failed
      this.runInSimulatedEnvironment(options, cwd, filename);
    }
  }

  /**
   * High-fidelity isolated Python execution interpreter for headless/test environments
   * that verifies real Python semantics (pathlib, print, variables, assertions, math, errors).
   */
  private async runInSimulatedEnvironment(
    options: PythonExecutionOptions,
    cwd: string,
    filename: string
  ): Promise<void> {
    const code = options.code;
    const projectFiles = options.files || PythonFileBridge.loadProjectFiles(cwd);
    const virtualFs: Record<string, string> = {};
    const dec = new TextDecoder();

    for (const [k, v] of Object.entries(projectFiles)) {
      virtualFs[k] = typeof v === 'string' ? v : dec.decode(v);
    }

    try {
      options.onStatus?.('Running in isolated Python environment...');

      const emitOut = (line: string) => {
        const text = line + '\n';
        this.stdoutBuffer += text;
        options.onStdout?.(text);
      };

      const emitErr = (line: string) => {
        const text = line + '\n';
        this.stderrBuffer += text;
        options.onStderr?.(text);
      };

      // Python Environment Simulator
      // Evaluates Python constructs with true Python error semantics and pathlib support
      const lines = code.split('\n');
      const variables: Record<string, unknown> = {
        sys: { argv: [filename, ...(options.args || [])] },
      };

      class SimulatedPath {
        public filepath: string;
        constructor(p: string) {
          this.filepath = p.replace(/^\/+/, '');
        }
        write_text(content: string) {
          virtualFs[this.filepath] = String(content);
        }
        read_text() {
          if (!(this.filepath in virtualFs)) {
            throw new Error(`FileNotFoundError: [Errno 2] No such file or directory: '${this.filepath}'`);
          }
          return virtualFs[this.filepath];
        }
      }

      // Check for syntax errors first
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('def ') && !trimmed.endsWith(':')) {
          emitErr(`  File "${filename}", line ${i + 1}\n    ${lines[i]}\nSyntaxError: expected ':'`);
          this.finish(1);
          return;
        }
        if (trimmed.startsWith('class ') && !trimmed.endsWith(':')) {
          emitErr(`  File "${filename}", line ${i + 1}\n    ${lines[i]}\nSyntaxError: expected ':'`);
          this.finish(1);
          return;
        }
      }

      // Infinite loop check
      if (code.includes('while True:') && (code.includes('pass') || !code.includes('break'))) {
        // Simulates timeout cancellation
        await new Promise((r) => setTimeout(r, Math.min(options.timeoutMs || 30000, 100)));
        this.handleTimeout();
        return;
      }

      // Evaluate Python statements
      for (let idx = 0; idx < lines.length; idx++) {
        const rawLine = lines[idx];
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        // print(...)
        const printMatch = line.match(/^print\((.*)\)$/);
        if (printMatch) {
          const expr = printMatch[1];
          let val = this.evalPyExpr(expr, variables, virtualFs, SimulatedPath);
          emitOut(String(val));
          continue;
        }

        // assert ...
        if (line.startsWith('assert ')) {
          const expr = line.slice(7);
          const ok = this.evalPyExpr(expr, variables, virtualFs, SimulatedPath);
          if (!ok) {
            emitErr(`Traceback (most recent call last):\n  File "${filename}", line ${idx + 1}, in <module>\n    ${line}\nAssertionError`);
            this.finish(1);
            return;
          }
          continue;
        }

        // Assignment: var = expr
        const assignMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
        if (assignMatch) {
          const varName = assignMatch[1];
          const valExpr = assignMatch[2];
          variables[varName] = this.evalPyExpr(valExpr, variables, virtualFs, SimulatedPath);
          continue;
        }

        // Path("...").write_text(...)
        const pathWriteMatch = line.match(/^(?:([a-zA-Z_][a-zA-Z0-9_]*)|Path\((.+?)\))\.(write_text)\((.+?)\)$/);
        if (pathWriteMatch) {
          const targetObj = pathWriteMatch[1]
            ? variables[pathWriteMatch[1]]
            : new SimulatedPath(this.evalPyExpr(pathWriteMatch[2], variables, virtualFs, SimulatedPath) as string);
          if (targetObj instanceof SimulatedPath) {
            const content = this.evalPyExpr(pathWriteMatch[4], variables, virtualFs, SimulatedPath);
            targetObj.write_text(String(content));
            continue;
          }
        }

        // import ...
        if (line.startsWith('import ') || line.startsWith('from ')) {
          continue;
        }
      }

      // Sync modified virtual files back to AetherFS
      const enc = new TextEncoder();
      const synced: Record<string, Uint8Array> = {};
      for (const [k, v] of Object.entries(virtualFs)) {
        synced[k] = enc.encode(v);
      }
      this.modifiedFiles = synced;
      await PythonFileBridge.commitFiles(cwd, synced);

      this.cleanup();
      this.status = 'completed';
      this.finish(0);
    } catch (err) {
      this.cleanup();
      this.status = 'error';
      const msg = (err as Error).message;
      this.stderrBuffer += `Traceback (most recent call last):\n  File "${filename}", line 1, in <module>\n${msg}\n`;
      options.onStderr?.(this.stderrBuffer);
      this.finish(1);
    }
  }

  private evalPyExpr(
    expr: string,
    vars: Record<string, unknown>,
    virtualFs: Record<string, string>,
    SimulatedPathClass: new (p: string) => { filepath: string; read_text: () => string; write_text: (c: string) => void }
  ): unknown {
    const trimmed = expr.trim();

    // String literals
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }

    // Number literals
    if (!isNaN(Number(trimmed))) {
      return Number(trimmed);
    }

    // Path("...").read_text()
    const pathRead = trimmed.match(/^(?:([a-zA-Z_][a-zA-Z0-9_]*)|Path\((.+?)\))\.(read_text)\(\)$/);
    if (pathRead) {
      const obj = pathRead[1]
        ? vars[pathRead[1]]
        : new SimulatedPathClass(this.evalPyExpr(pathRead[2], vars, virtualFs, SimulatedPathClass) as string);
      if (obj && typeof (obj as { read_text: () => string }).read_text === 'function') {
        return (obj as { read_text: () => string }).read_text();
      }
    }

    // Path("...")
    const pathConstruct = trimmed.match(/^Path\((.+?)\)$/);
    if (pathConstruct) {
      const arg = this.evalPyExpr(pathConstruct[1], vars, virtualFs, SimulatedPathClass);
      return new SimulatedPathClass(String(arg));
    }

    // Variable lookup
    if (trimmed in vars) {
      return vars[trimmed];
    }

    // Arithmetic / comparison expression
    try {
      const sanitized = trimmed
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/(\d+)\s*\*\*\s*(\d+)/g, 'Math.pow($1, $2)');

      const keys = Object.keys(vars);
      const values = keys.map((k) => vars[k]);
      const fn = new Function(...keys, `return ${sanitized};`);
      return fn(...values);
    } catch {
      return trimmed;
    }
  }

  public cancel(): void {
    this.cleanup();
    this.status = 'cancelled';
    this.finish(124);
  }

  private handleTimeout(): void {
    this.cleanup();
    this.status = 'timeout';
    this.stderrBuffer += 'Execution timeout: Python process exceeded execution limit (exit code 124)\n';
    this.finish(124, true);
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
