// AetherOS - Structured System Logger
import type { SystemLogEntry } from './types';

export class SystemLogger {
  private logs: SystemLogEntry[] = [];
  private maxEntries = 1000;
  private listeners = new Set<(entry: SystemLogEntry) => void>();

  constructor() {
    this.info('kernel', 'AetherCore logger initialized');
  }

  public log(
    level: SystemLogEntry['level'],
    subsystem: string,
    message: string,
    meta?: Record<string, unknown>
  ): SystemLogEntry {
    const entry: SystemLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      subsystem,
      level,
      message,
      meta,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxEntries) {
      this.logs.shift();
    }

    // Notify UI listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error('Error notifying log listener:', err);
      }
    }

    return entry;
  }

  public debug(subsystem: string, message: string, meta?: Record<string, unknown>): SystemLogEntry {
    return this.log('debug', subsystem, message, meta);
  }

  public info(subsystem: string, message: string, meta?: Record<string, unknown>): SystemLogEntry {
    return this.log('info', subsystem, message, meta);
  }

  public warn(subsystem: string, message: string, meta?: Record<string, unknown>): SystemLogEntry {
    return this.log('warn', subsystem, message, meta);
  }

  public error(subsystem: string, message: string, meta?: Record<string, unknown>): SystemLogEntry {
    return this.log('error', subsystem, message, meta);
  }

  public getLogs(filter?: {
    level?: SystemLogEntry['level'];
    subsystem?: string;
    search?: string;
    limit?: number;
  }): SystemLogEntry[] {
    let result = [...this.logs];

    if (filter?.level) {
      result = result.filter((l) => l.level === filter.level);
    }
    if (filter?.subsystem) {
      result = result.filter(
        (l) => l.subsystem.toLowerCase() === filter.subsystem!.toLowerCase()
      );
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (l) => l.message.toLowerCase().includes(q) || l.subsystem.toLowerCase().includes(q)
      );
    }
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(-filter.limit);
    }

    return result;
  }

  public subscribe(listener: (entry: SystemLogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public clear(): void {
    this.logs = [];
    this.info('logger', 'System log buffer cleared');
  }

  /**
   * Format logs like Linux journalctl or dmesg
   */
  public formatDmesg(): string[] {
    const startTime = this.logs[0]?.timestamp || Date.now();
    return this.logs.map((entry) => {
      const seconds = ((entry.timestamp - startTime) / 1000).toFixed(6).padStart(12, ' ');
      const levelTag = entry.level.toUpperCase().padEnd(5, ' ');
      return `[${seconds}] [${levelTag}] [${entry.subsystem}] ${entry.message}`;
    });
  }

  public formatJournal(): string[] {
    return this.logs.map((entry) => {
      const date = new Date(entry.timestamp).toISOString().replace('T', ' ').substring(0, 19);
      return `${date} aetheros ${entry.subsystem}[sys]: [${entry.level.toUpperCase()}] ${entry.message}`;
    });
  }
}

export const systemLogger = new SystemLogger();
