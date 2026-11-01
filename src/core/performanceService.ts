// AetherOS - Centralized Performance Monitoring & Telemetry Service
import { virtualKernel } from './kernel';
import { systemLogger } from './logger';

export interface PerformanceSample {
  timestamp: number;
  cpuPercent: number;
  usedMemoryKb: number;
  totalMemoryKb: number;
  memoryPercent: number;
  activeProcesses: number;
  activeWorkers: number;
  source: 'performance.memory' | 'virtual_heap';
}

export interface PerformanceEvent {
  id: string;
  timestamp: number;
  category: 'runtime' | 'vfs' | 'kernel' | 'task';
  description: string;
  durationMs?: number;
}

export class PerformanceService {
  private history: PerformanceSample[] = [];
  private readonly maxSamples = 60;
  private readonly intervalMs = 1000;
  private timer: ReturnType<typeof setInterval> | null = null;
  private subscribers = new Set<(sample: PerformanceSample) => void>();
  private events: PerformanceEvent[] = [];
  private readonly maxEvents = 100;

  constructor() {
    // Prime initial sample
    this.takeSample();
  }

  public getHistory(): PerformanceSample[] {
    return [...this.history];
  }

  public getCurrentSample(): PerformanceSample {
    return this.history[this.history.length - 1] ?? this.takeSample();
  }

  public subscribe(callback: (sample: PerformanceSample) => void): () => void {
    this.subscribers.add(callback);
    // Auto-start sampling when first subscriber attaches to conserve battery/CPU when inactive
    if (!this.timer) {
      this.startSampling();
    }

    // Immediately push current sample
    callback(this.getCurrentSample());

    return () => {
      this.subscribers.delete(callback);
      // Auto-pause sampling when no active subscribers exist
      if (this.subscribers.size === 0) {
        this.stopSampling();
      }
    };
  }

  public recordEvent(
    category: PerformanceEvent['category'],
    description: string,
    durationMs?: number
  ): void {
    const event: PerformanceEvent = {
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      category,
      description,
      durationMs,
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  public getEvents(): PerformanceEvent[] {
    return [...this.events];
  }

  public async measureTask<T>(
    taskName: string,
    category: PerformanceEvent['category'],
    fn: () => Promise<T> | T
  ): Promise<{ result: T; durationMs: number }> {
    const start = performance.now();
    try {
      const result = await fn();
      const durationMs = Math.round(performance.now() - start);
      this.recordEvent(category, `${taskName} completed`, durationMs);
      return { result, durationMs };
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      this.recordEvent(category, `${taskName} failed: ${String(err)}`, durationMs);
      throw err;
    }
  }

  public getMetadata(): {
    hasPerformanceMemory: boolean;
    maxHistorySamples: number;
    samplingIntervalMs: number;
  } {
    return {
      hasPerformanceMemory: typeof performance !== 'undefined' && Boolean((performance as unknown as { memory?: unknown })?.memory),
      maxHistorySamples: this.maxSamples,
      samplingIntervalMs: this.intervalMs,
    };
  }

  private startSampling(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const sample = this.takeSample();
      for (const cb of this.subscribers) {
        try {
          cb(sample);
        } catch (err) {
          systemLogger.error('kernel', `Error in performance subscriber callback: ${String(err)}`);
        }
      }
    }, this.intervalMs);
  }

  private stopSampling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private takeSample(): PerformanceSample {
    const procs = virtualKernel.getProcesses();
    const cpu = virtualKernel.getAverageCpuUsage();
    const mem = virtualKernel.getTotalMemoryUsage();

    let activeWorkers = 0;
    for (const p of procs) {
      if (p.worker) activeWorkers++;
    }

    const sample: PerformanceSample = {
      timestamp: Date.now(),
      cpuPercent: cpu,
      usedMemoryKb: mem.usedKb,
      totalMemoryKb: mem.totalKb,
      memoryPercent: mem.percent,
      activeProcesses: procs.length,
      activeWorkers,
      source: mem.source,
    };

    this.history.push(sample);
    if (this.history.length > this.maxSamples) {
      this.history.shift();
    }

    return sample;
  }
}

export const performanceService = new PerformanceService();
