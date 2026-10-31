// AetherOS - AetherCore Virtual Kernel & Process Manager
import type { Process, SignalType } from './types';
import { systemEventBus } from './eventBus';
import { systemLogger } from './logger';

export class VirtualKernel {
  private processes = new Map<number, Process>();
  private nextPid = 100;
  private bootTime = Date.now();
  private statsTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.initKernelSpace();
    this.startResourceSampler();
  }

  private initKernelSpace() {
    // PID 1: systemd (init)
    const initProc: Process = {
      pid: 1,
      ppid: 0,
      name: 'systemd',
      command: '/sbin/init',
      args: ['splash'],
      user: 'root',
      state: 'running',
      startTime: this.bootTime,
      cpuPercent: 0.1,
      memoryKb: 4096,
    };
    this.processes.set(1, initProc);

    // PID 2: kthreadd
    const kthreadProc: Process = {
      pid: 2,
      ppid: 0,
      name: 'kthreadd',
      command: '[kthreadd]',
      args: [],
      user: 'root',
      state: 'running',
      startTime: this.bootTime,
      cpuPercent: 0.0,
      memoryKb: 2048,
    };
    this.processes.set(2, kthreadProc);

    // PID 3: aether-desktop
    const desktopProc: Process = {
      pid: 3,
      ppid: 1,
      name: 'aether-desktop',
      command: '/usr/bin/aether-desktop',
      args: ['--compositor=webgl'],
      user: 'aether',
      state: 'running',
      startTime: this.bootTime,
      cpuPercent: 0.8,
      memoryKb: 16384,
    };
    this.processes.set(3, desktopProc);

    systemLogger.info('kernel', 'Virtual kernel initialized (PID 1: systemd, PID 2: kthreadd)');
  }

  private startResourceSampler() {
    // Periodically update process CPU and memory metrics
    this.statsTimer = setInterval(() => {
      for (const proc of this.processes.values()) {
        if (proc.state === 'running') {
          // Dynamic realistic variation
          const baseCpu = proc.pid < 10 ? 0.2 : 0.8;
          const jitter = (Math.random() - 0.5) * 0.4;
          proc.cpuPercent = Math.max(0.0, +(baseCpu + jitter).toFixed(1));
          
          // Realistic memory based on process type
          const memJitter = Math.floor((Math.random() - 0.5) * 64);
          proc.memoryKb = Math.max(1024, proc.memoryKb + memJitter);
        }
      }
    }, 3000);
  }

  /**
   * Spawn a new virtual process
   */
  public spawn(options: {
    name: string;
    command: string;
    args?: string[];
    user?: string;
    ppid?: number;
    windowId?: string;
    appId?: string;
    cleanup?: () => void;
  }): Process {
    const pid = this.nextPid++;
    const proc: Process = {
      pid,
      ppid: options.ppid ?? 1,
      name: options.name,
      command: options.command,
      args: options.args ?? [],
      user: options.user ?? 'aether',
      state: 'running',
      startTime: Date.now(),
      cpuPercent: +(Math.random() * 1.5 + 0.5).toFixed(1),
      memoryKb: Math.floor(Math.random() * 8192 + 8192),
      windowId: options.windowId,
      appId: options.appId,
      cleanup: options.cleanup,
    };

    this.processes.set(pid, proc);
    systemLogger.info('kernel', `Process started: [${pid}] ${proc.name} (${proc.command})`);
    systemEventBus.emit('process:started', { process: proc });

    return proc;
  }

  /**
   * Terminate a process with exit code
   */
  public exit(pid: number, exitCode = 0): boolean {
    const proc = this.processes.get(pid);
    if (!proc) return false;

    if (pid <= 2) {
      systemLogger.warn('kernel', `Cannot terminate critical system process [${pid}]`);
      return false;
    }

    try {
      if (proc.cleanup) {
        proc.cleanup();
      }
      if (proc.worker) {
        proc.worker.terminate();
      }
    } catch (err) {
      systemLogger.error('kernel', `Error during cleanup of process [${pid}]: ${String(err)}`);
    }

    proc.state = 'terminated';
    proc.exitCode = exitCode;
    this.processes.delete(pid);

    systemLogger.info('kernel', `Process terminated: [${pid}] ${proc.name} (exit ${exitCode})`);
    systemEventBus.emit('process:terminated', { pid, exitCode });

    return true;
  }

  /**
   * Send signal to a process
   */
  public kill(pid: number, signal: SignalType = 'SIGTERM'): boolean {
    const proc = this.processes.get(pid);
    if (!proc) {
      systemLogger.warn('kernel', `kill: No such process [${pid}]`);
      return false;
    }

    systemLogger.info('kernel', `Sent ${signal} to process [${pid}] ${proc.name}`);

    switch (signal) {
      case 'SIGKILL':
      case 'SIGTERM':
      case 'SIGINT':
        return this.exit(pid, signal === 'SIGKILL' ? 137 : signal === 'SIGTERM' ? 143 : 130);
      case 'SIGSTOP':
        proc.state = 'stopped';
        systemEventBus.emit('process:updated', { process: proc });
        return true;
      case 'SIGCONT':
        proc.state = 'running';
        systemEventBus.emit('process:updated', { process: proc });
        return true;
      default:
        return false;
    }
  }

  /**
   * Kill process by name (killall)
   */
  public killAll(name: string, signal: SignalType = 'SIGTERM'): number {
    let count = 0;
    for (const proc of Array.from(this.processes.values())) {
      if (proc.name.toLowerCase() === name.toLowerCase()) {
        if (this.kill(proc.pid, signal)) {
          count++;
        }
      }
    }
    return count;
  }

  public getProcess(pid: number): Process | undefined {
    return this.processes.get(pid);
  }

  public getProcesses(): Process[] {
    return Array.from(this.processes.values()).sort((a, b) => a.pid - b.pid);
  }

  public findByAppId(appId: string): Process[] {
    return Array.from(this.processes.values()).filter((p) => p.appId === appId);
  }

  public findByWindowId(windowId: string): Process | undefined {
    return Array.from(this.processes.values()).find((p) => p.windowId === windowId);
  }

  public getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.bootTime) / 1000);
  }

  public getFormattedUptime(): string {
    const totalSecs = this.getUptimeSeconds();
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  }

  public getTotalMemoryUsage(): { usedKb: number; totalKb: number; percent: number } {
    let usedKb = 0;
    for (const proc of this.processes.values()) {
      usedKb += proc.memoryKb;
    }
    const totalKb = 1024 * 1024; // 1GB simulated virtual total
    const percent = Math.min(100, Math.round((usedKb / totalKb) * 100));
    return { usedKb, totalKb, percent };
  }

  public getAverageCpuUsage(): number {
    let total = 0;
    let count = 0;
    for (const proc of this.processes.values()) {
      if (proc.state === 'running') {
        total += proc.cpuPercent;
        count++;
      }
    }
    return +(total).toFixed(1);
  }

  public getKernelVersion(): string {
    return '6.8.0-aether';
  }

  public shutdown(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
    }
    systemLogger.info('kernel', 'Virtual kernel shutting down processes');
    for (const proc of Array.from(this.processes.values())) {
      if (proc.pid > 2) {
        this.exit(proc.pid, 0);
      }
    }
  }
}

export const virtualKernel = new VirtualKernel();
