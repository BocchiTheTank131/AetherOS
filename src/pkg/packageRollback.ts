// AetherOS - Package Rollback & History Manager
import { vfs } from '../vfs/vfs';
import { systemLogger } from '../core/logger';
import type { AppManifest } from '../appPlatform/AppManifest';

const HISTORY_DIR = '/var/lib/aetherpkg/history';

export interface PackageHistoryEntry {
  version: string;
  manifest: AppManifest;
  installedAt: string;
  installDir: string;
}

export class PackageRollback {
  private static ensureHistoryDir(): void {
    if (!vfs.exists(HISTORY_DIR)) {
      vfs.mkdir(HISTORY_DIR, { recursive: true });
    }
  }

  private static getHistoryFilePath(packageId: string): string {
    this.ensureHistoryDir();
    return `${HISTORY_DIR}/${packageId}.json`;
  }

  public static getHistory(packageId: string): PackageHistoryEntry[] {
    try {
      const filePath = this.getHistoryFilePath(packageId);
      if (!vfs.exists(filePath)) return [];
      const raw = vfs.readFile(filePath);
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public static recordVersion(packageId: string, entry: PackageHistoryEntry): void {
    try {
      const history = this.getHistory(packageId);
      // Remove any existing entry for this exact version, then append
      const filtered = history.filter((h) => h.version !== entry.version);
      filtered.push(entry);
      // Keep up to 5 previous versions
      if (filtered.length > 5) {
        filtered.splice(0, filtered.length - 5);
      }
      const filePath = this.getHistoryFilePath(packageId);
      vfs.writeFile(filePath, JSON.stringify(filtered, null, 2));
    } catch (err) {
      systemLogger.warn('pkg', `Failed to record package history for ${packageId}: ${String(err)}`);
    }
  }

  public static getPreviousVersion(packageId: string, currentVersion: string): PackageHistoryEntry | null {
    const history = this.getHistory(packageId);
    const candidates = history.filter((h) => h.version !== currentVersion);
    if (candidates.length === 0) return null;
    return candidates[candidates.length - 1];
  }

  public static clearHistory(packageId: string): void {
    const filePath = this.getHistoryFilePath(packageId);
    if (vfs.exists(filePath)) {
      try {
        vfs.unlink(filePath);
      } catch {}
    }
  }
}
