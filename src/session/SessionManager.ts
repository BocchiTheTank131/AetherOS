// AetherOS - Session Persistence & Restoration Manager
import { vfs } from '../vfs/vfs';
import { systemLogger } from '../core/logger';
import type { WindowInstance } from '../desktop/types';

const SESSION_FILE = '/home/aether/.config/aetheros/session.json';

export interface SavedWindowState {
  appId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  state: 'normal' | 'minimized' | 'maximized' | 'snapped-left' | 'snapped-right';
  workspace: number;
}

export interface SavedSession {
  version: 1;
  activeWorkspace: number;
  windows: SavedWindowState[];
  savedAt: string;
}

export class SessionManager {
  private static ensureConfigDir(): void {
    if (!vfs.exists('/home/aether/.config/aetheros')) {
      vfs.mkdir('/home/aether/.config/aetheros', { recursive: true });
    }
  }

  public static saveSession(activeWorkspace: number, windows: WindowInstance[]): void {
    try {
      this.ensureConfigDir();
      const validWindows: SavedWindowState[] = windows.map((w) => ({
        appId: w.appId,
        title: w.title,
        x: Math.round(w.x),
        y: Math.round(w.y),
        width: Math.round(w.width),
        height: Math.round(w.height),
        state: w.state,
        workspace: w.workspaceId,
      }));

      const sessionData: SavedSession = {
        version: 1,
        activeWorkspace,
        windows: validWindows,
        savedAt: new Date().toISOString(),
      };

      vfs.writeFile(SESSION_FILE, JSON.stringify(sessionData, null, 2));
    } catch (err) {
      systemLogger.warn('session', `Failed to save desktop session: ${String(err)}`);
    }
  }

  public static loadSession(isAppInstalled: (appId: string) => boolean): {
    activeWorkspace: number;
    windows: SavedWindowState[];
  } | null {
    try {
      if (!vfs.exists(SESSION_FILE)) return null;

      const raw = vfs.readFile(SESSION_FILE);
      const parsed: SavedSession = JSON.parse(raw);

      if (parsed.version !== 1 || !Array.isArray(parsed.windows)) {
        return null;
      }

      // Filter and validate windows
      const validWindows: SavedWindowState[] = [];
      const viewW = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const viewH = typeof window !== 'undefined' ? window.innerHeight : 800;

      for (const w of parsed.windows) {
        if (!w || typeof w.appId !== 'string') continue;

        // Skip if application is no longer installed
        if (!isAppInstalled(w.appId)) {
          systemLogger.info('session', `Skipping uninstalled app in session restore: ${w.appId}`);
          continue;
        }

        const clampedX = Math.max(10, Math.min(viewW - 100, typeof w.x === 'number' ? w.x : 100));
        const clampedY = Math.max(10, Math.min(viewH - 80, typeof w.y === 'number' ? w.y : 100));
        const clampedW = Math.max(200, Math.min(viewW - 20, typeof w.width === 'number' ? w.width : 700));
        const clampedH = Math.max(150, Math.min(viewH - 50, typeof w.height === 'number' ? w.height : 480));

        validWindows.push({
          appId: w.appId,
          title: typeof w.title === 'string' ? w.title : w.appId,
          x: clampedX,
          y: clampedY,
          width: clampedW,
          height: clampedH,
          state: w.state || 'normal',
          workspace: typeof w.workspace === 'number' && w.workspace >= 1 && w.workspace <= 4 ? w.workspace : 1,
        });
      }

      const activeWs =
        typeof parsed.activeWorkspace === 'number' &&
        parsed.activeWorkspace >= 1 &&
        parsed.activeWorkspace <= 4
          ? parsed.activeWorkspace
          : 1;

      return {
        activeWorkspace: activeWs,
        windows: validWindows,
      };
    } catch (err) {
      systemLogger.warn('session', `Failed to load desktop session: ${String(err)}`);
      return null;
    }
  }

  public static clearSession(): void {
    if (vfs.exists(SESSION_FILE)) {
      try {
        vfs.unlink(SESSION_FILE);
      } catch {}
    }
  }
}
