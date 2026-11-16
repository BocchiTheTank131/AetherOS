// AetherOS - Developer Task Manager & Build Runner
import { shellExecutor } from '../shell/executor';
import { virtualKernel } from '../core/kernel';
import { createDefaultShellContext } from '../shell/environment';
import { vfs } from '../vfs/vfs';
import type { TaskDefinition, TaskExecution } from './types';

export class TaskManager {
  private activeTasks = new Map<number, TaskExecution>();

  /**
   * Retrieves available tasks for a given project root.
   */
  public getTasksForProject(projectDir: string): TaskDefinition[] {
    const norm = vfs.normalizePath(projectDir);
    const tasks: TaskDefinition[] = [];

    const scripts: Record<string, unknown> = Object.create(null);
    for (const file of ['manifest.json', 'package.json', 'aether.json']) {
      try {
        const config = JSON.parse(vfs.readFile(`${norm}/${file}`));
        Object.assign(scripts, config.scripts, config.tasks);
      } catch {}
    }

    for (const [name, script] of Object.entries(scripts)) {
      if (!name || name.length > 64) continue;
      const command = typeof script === 'string' ? script : script && typeof script === 'object' && 'command' in script ? script.command : undefined;
      if (typeof command !== 'string' || !command.trim()) continue;
      const timeout = script && typeof script === 'object' && 'timeoutMs' in script ? script.timeoutMs : undefined;
      tasks.push({
        id: name,
        name,
        command,
        timeoutMs: typeof timeout === 'number' && Number.isFinite(timeout) ? Math.max(1, Math.min(timeout, 300_000)) : undefined,
      });
    }

    // Default tasks if not specified
    if (!tasks.some((t) => t.id === 'build')) {
      if (vfs.exists(`${norm}/tsconfig.json`) || vfs.exists(`${norm}/main.ts`) || vfs.exists(`${norm}/src/main.ts`)) {
        tasks.push({
          id: 'build',
          name: 'build',
          command: vfs.exists(`${norm}/tsconfig.json`) ? 'tsc -p tsconfig.json' : 'tsc',
          description: 'Compile TypeScript project',
        });
      }
    }

    if (!tasks.some((t) => t.id === 'package') && vfs.exists(`${norm}/manifest.json`)) {
      tasks.push({
        id: 'package',
        name: 'package',
        command: 'aether build .',
        description: 'Package into .aepkg application archive',
      });
    }

    if (!tasks.some((t) => t.id === 'run')) {
      if (vfs.exists(`${norm}/main.py`)) {
        tasks.push({
          id: 'run',
          name: 'run',
          command: 'python main.py',
          description: 'Execute Python main.py',
        });
      } else if (vfs.exists(`${norm}/dist/main.js`)) {
        tasks.push({
          id: 'run',
          name: 'run',
          command: 'js dist/main.js',
          description: 'Execute bundled JavaScript in runtime',
        });
      }
    }

    return tasks;
  }

  public cancel(pid: number): boolean {
    return this.activeTasks.has(pid) && virtualKernel.kill(pid, 'SIGINT');
  }

  public async runTask(
    projectDir: string,
    task: TaskDefinition,
    onOutput?: (chunk: string) => void,
    onState?: (execution: TaskExecution) => void,
    ppid?: number,
  ): Promise<TaskExecution> {
    if (this.activeTasks.size >= 8) throw new Error('Eight tasks are already running');
    const controller = new AbortController();
    const process = virtualKernel.spawn({
      name: task.name,
      command: task.command,
      ppid,
      cleanup: (exitCode) => controller.abort(exitCode),
    });
    const execution: TaskExecution = {
      taskId: task.id, pid: process.pid, status: 'running', startTime: Date.now(), output: [],
    };
    this.activeTasks.set(execution.pid, execution);
    const timer = setTimeout(() => virtualKernel.exit(execution.pid, 124), task.timeoutMs ?? 60_000);
    let remaining = 256 * 1024;
    const output = (chunk: string) => {
      if (!chunk || remaining <= 0) return;
      const part = chunk.slice(0, remaining);
      remaining -= part.length;
      execution.output.push(part);
      onOutput?.(part);
    };

    let exitCode = 1;
    try {
      onState?.({ ...execution });
      onOutput?.(`[Task: ${task.name}] ${task.command} (PID ${execution.pid})\n`);
      const result = await shellExecutor.execute(task.command, {
        ...createDefaultShellContext(),
        cwd: projectDir,
        pid: execution.pid,
        signal: controller.signal,
        onOutput: output,
      });
      if (!execution.output.length) {
        output(result.stdout);
        output(result.stderr);
      }
      exitCode = result.exitCode;
    } catch (error) {
      output(`Task failed: ${String(error)}\n`);
    } finally {
      clearTimeout(timer);
      const aborted = controller.signal.aborted;
      if (aborted) exitCode = Number(controller.signal.reason) || 130;
      execution.exitCode = exitCode;
      execution.endTime = Date.now();
      execution.status = exitCode === 124 ? 'timed-out' : aborted ? 'cancelled' : exitCode === 0 ? 'completed' : 'failed';
      this.activeTasks.delete(execution.pid);
      virtualKernel.exit(execution.pid, exitCode);
      onState?.({ ...execution });
      onOutput?.(`[Task: ${task.name}] ${execution.status} (exit ${exitCode}, ${execution.endTime - execution.startTime}ms)\n`);
    }
    return execution;
  }
}

export const taskManager = new TaskManager();
