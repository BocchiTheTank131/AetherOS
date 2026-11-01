// AetherOS - Developer Task Manager & Build Runner
import { shellExecutor } from '../shell/executor';
import { vfs } from '../vfs/vfs';
import type { TaskDefinition, TaskExecution } from './types';

export class TaskManager {
  private activeTasks = new Map<string, TaskExecution>();

  /**
   * Retrieves available tasks for a given project root.
   */
  public getTasksForProject(projectDir: string): TaskDefinition[] {
    const norm = vfs.normalizePath(projectDir);
    const tasks: TaskDefinition[] = [];

    // Check aether.json or package.json
    let scripts: Record<string, string> = {};
    const aetherConfig = `${norm}/aether.json`;
    const pkgConfig = `${norm}/package.json`;

    if (vfs.exists(aetherConfig)) {
      try {
        const parsed = JSON.parse(vfs.readFile(aetherConfig));
        if (parsed.scripts) scripts = { ...scripts, ...parsed.scripts };
      } catch {}
    } else if (vfs.exists(pkgConfig)) {
      try {
        const parsed = JSON.parse(vfs.readFile(pkgConfig));
        if (parsed.scripts) scripts = { ...scripts, ...parsed.scripts };
      } catch {}
    }

    for (const [name, command] of Object.entries(scripts)) {
      tasks.push({
        id: name,
        name,
        command,
        description: `Run script: ${command}`,
      });
    }

    // Default tasks if not specified
    if (!tasks.some((t) => t.id === 'build')) {
      if (vfs.exists(`${norm}/tsconfig.json`) || vfs.exists(`${norm}/main.ts`) || vfs.exists(`${norm}/src/main.ts`)) {
        tasks.push({
          id: 'build',
          name: 'build',
          command: 'tsc -p tsconfig.json',
          description: 'Compile TypeScript project',
        });
      }
    }

    if (!tasks.some((t) => t.id === 'package') && vfs.exists(`${norm}/manifest.json`)) {
      tasks.push({
        id: 'package',
        name: 'package',
        command: `aetherpkg build ${norm}`,
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

  /**
   * Executes a task in the project context.
   */
  public async runTask(
    projectDir: string,
    task: TaskDefinition,
    onOutput?: (chunk: string) => void
  ): Promise<TaskExecution> {
    const execution: TaskExecution = {
      taskId: task.id,
      pid: 1000 + Math.floor(Math.random() * 500),
      status: 'running',
      startTime: Date.now(),
      output: [],
    };

    this.activeTasks.set(task.id, execution);

    onOutput?.(`[Task: ${task.name}] Running: ${task.command} (PID ${execution.pid})...\n`);

    try {
      const res = await shellExecutor.execute(task.command, {
        cwd: projectDir,
        env: { PATH: '/bin:/usr/bin', HOME: '/home/aether' },
        user: 'aether',
        hostname: 'aether-box',
        aliases: {},
        history: [],
        exitCode: 0,
      });

      if (res.stdout) {
        execution.output.push(res.stdout);
        onOutput?.(res.stdout);
      }
      if (res.stderr) {
        execution.output.push(res.stderr);
        onOutput?.(res.stderr);
      }

      execution.status = res.exitCode === 0 ? 'completed' : 'failed';
      execution.exitCode = res.exitCode;
      execution.endTime = Date.now();
      onOutput?.(`[Task: ${task.name}] Finished with exit code ${res.exitCode} (${execution.endTime - execution.startTime}ms)\n`);
    } catch (err) {
      execution.status = 'failed';
      execution.exitCode = 1;
      execution.endTime = Date.now();
      const errText = `Task execution error: ${(err as Error).message}\n`;
      execution.output.push(errText);
      onOutput?.(errText);
    } finally {
      this.activeTasks.delete(task.id);
    }

    return execution;
  }
}

export const taskManager = new TaskManager();
