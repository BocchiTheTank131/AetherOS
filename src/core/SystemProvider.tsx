// AetherOS - Main System React Context & State Provider
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { SystemTheme, UserAccount, SystemNotification } from './types';
import type { WindowInstance, WindowDisplayState } from '../desktop/types';
import { SystemContext, type SystemContextValue } from './context';
import { idbStorage } from '../vfs/idbStorage';
import { vfs } from '../vfs/vfs';
import { virtualKernel } from './kernel';
import { systemLogger } from './logger';
import { systemEventBus } from './eventBus';
import { audioService } from './audio';
import { appRegistry } from '../apps/appRegistry';
import { packageManager } from '../pkg/packageManager';
import { SessionManager } from '../session/SessionManager';

function focusWorkspace(windows: WindowInstance[], workspace: number): WindowInstance[] {
  const top = windows.reduce<WindowInstance | undefined>((focused, win) =>
    win.workspaceId === workspace && win.state !== 'minimized' && (!focused || win.zIndex > focused.zIndex) ? win : focused,
    undefined);
  return windows.map((win) => win.isFocused === (win === top) ? win : { ...win, isFocused: win === top });
}

const DEFAULT_THEME: SystemTheme = {
  mode: 'dark',
  accentColor: 'cyan',
  accentHex: '#00f2fe',
  wallpaper: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2560&auto=format&fit=crop',
  transparency: true,
  blur: true,
  reducedMotion: false,
  fontSize: 'medium',
  dockPosition: 'bottom',
  dockAutoHide: false,
};

const DEFAULT_USER: UserAccount = {
  username: 'aether',
  displayName: 'Aether Navigator',
  avatar: 'User',
  role: 'admin',
  homeDir: '/home/aether',
  shell: '/bin/aesh',
};

export const SystemProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [booted, setBooted] = useState(false);
  const [isPoweredOff, setIsPoweredOff] = useState(false);
  const [theme, setThemeState] = useState<SystemTheme>(DEFAULT_THEME);
  const [user, setUserState] = useState<UserAccount>(DEFAULT_USER);
  const [isLocked, setIsLocked] = useState(false);
  const [windows, setWindows] = useState<WindowInstance[]>([]);
  const [activeWorkspace, setWorkspace] = useState(1);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [appLauncherOpen, setAppLauncherOpen] = useState(false);
  const [quickRunnerOpen, setQuickRunnerOpen] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [recentApps, setRecentApps] = useState<string[]>([
    'terminal',
    'file-manager',
    'code-studio',
    'text-editor',
  ]);
  const savedWindowPositions = React.useRef<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const openWindowRef = React.useRef<(appId: string, props?: Record<string, unknown>) => string>(() => '');

  const powerTransition = React.useRef(false);
  const sessionRef = React.useRef({ windows, activeWorkspace, booted });
  useEffect(() => {
    sessionRef.current = { windows, activeWorkspace, booted };
  }, [windows, activeWorkspace, booted]);

  const setActiveWorkspace = useCallback((id: number) => {
    if (!Number.isInteger(id) || id < 1 || id > 4) return;
    setWorkspace(id);
    setWindows((prev) => focusWorkspace(prev, id));
  }, []);

  // Synchronize system theme classes and CSS variables with document root
  useEffect(() => {
    const root = document.documentElement;
    if (theme.mode === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
    root.style.setProperty('--aether-accent', theme.accentHex || '#06b6d4');
    root.style.setProperty(
      '--aether-font-size',
      theme.fontSize === 'small' ? '12px' : theme.fontSize === 'large' ? '16px' : '14px'
    );
  }, [theme.mode, theme.accentHex, theme.fontSize]);

  // Viewport resize clamping
  useEffect(() => {
    const handleResize = () => {
      setWindows((prev) =>
        prev.map((win) => {
          if (
            win.state === 'maximized' ||
            win.state === 'snapped-left' ||
            win.state === 'snapped-right'
          ) {
            return win;
          }
          const clampedX = Math.max(10, Math.min(window.innerWidth - 100, win.x));
          const clampedY = Math.max(10, Math.min(window.innerHeight - 80, win.y));
          const clampedW = Math.min(window.innerWidth - 20, win.width);
          const clampedH = Math.min(window.innerHeight - 50, win.height);
          if (
            clampedX !== win.x ||
            clampedY !== win.y ||
            clampedW !== win.width ||
            clampedH !== win.height
          ) {
            return { ...win, x: clampedX, y: clampedY, width: clampedW, height: clampedH };
          }
          return win;
        })
      );
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize Core Systems
  useEffect(() => {
    let mounted = true;

    async function init() {
      systemLogger.info('boot', 'System startup sequence initiated');
      await vfs.init();
      if (!mounted) return;
      await packageManager.init();

      // Load theme configuration from VFS if available
      try {
        if (vfs.exists('/home/aether/.config/aetheros/theme.json')) {
          const themeJson = vfs.readFile('/home/aether/.config/aetheros/theme.json');
          const savedTheme = JSON.parse(themeJson);
          if (mounted) setThemeState((prev) => ({ ...prev, ...savedTheme }));
        }
      } catch {}

      // Restore desktop session if available
      try {
        const savedSession = SessionManager.loadSession((id) => !!appRegistry.get(id));
        if (savedSession && mounted) {
          if (savedSession.activeWorkspace) {
            setWorkspace(savedSession.activeWorkspace);
          }
          if (savedSession.windows.length > 0) {
            const restoredWins: WindowInstance[] = savedSession.windows.map((sw, idx) => {
              const winId = `win-${sw.appId}-${Date.now()}-${idx}`;
              const app = appRegistry.get(sw.appId);
              const proc = virtualKernel.spawn({
                name: app?.name || sw.title,
                command: app?.executable || `/usr/bin/${sw.appId}`,
                user: DEFAULT_USER.username,
                windowId: winId,
                appId: sw.appId,
              });
              return {
                id: winId,
                appId: sw.appId,
                title: sw.title,
                icon: app?.icon || 'Package',
                x: sw.x,
                y: sw.y,
                width: sw.width,
                height: sw.height,
                minWidth: app?.minWidth || 360,
                minHeight: app?.minHeight || 280,
                zIndex: 10 + idx,
                isFocused: false,
                state: sw.state,
                workspaceId: sw.workspace,
                props: sw.props,
                pid: proc.pid,
              };
            });
            setWindows(focusWorkspace(restoredWins, savedSession.activeWorkspace));
          }
        }
      } catch (err) {
        systemLogger.warn('session', `Session restore notice: ${String(err)}`);
      }

      if (mounted) {
        setBooted(true);
        systemLogger.info('boot', 'AetherOS desktop environment ready');
        systemEventBus.emit('system:ready', { timestamp: Date.now() });
        audioService.playBootSound();
      }
    }

    init();

    const changePower = async (restart: boolean) => {
      if (powerTransition.current) return;
      powerTransition.current = true;
      try {
        const session = sessionRef.current;
        if (session.booted) {
          for (const guard of closeGuards.current.values()) {
            if (!await guard()) return;
          }
          SessionManager.saveSession(session.activeWorkspace, session.windows);
        }
        systemEventBus.emit('system:stopping', { timestamp: Date.now() });
        setBooted(false);
        setIsPoweredOff(!restart);
        setWindows([]);
        virtualKernel.shutdown();
        await vfs.flush();
        if (restart && mounted) {
          virtualKernel.start();
          await init();
        }
      } catch (error) {
        systemLogger.error('boot', 'System power transition failed: ' + String(error));
      } finally {
        powerTransition.current = false;
      }
    };

    const unsubRestart = systemEventBus.on('system:restart', () => void changePower(true));
    const unsubShutdown = systemEventBus.on('system:shutdown', () => void changePower(false));
    const unsubAppClose = systemEventBus.on('app:close_requested', (event: unknown) => {
      const appId = (event as { appId?: string })?.appId;
      if (!appId) return;
      for (const process of virtualKernel.getProcesses()) {
        if (process.appId === appId && process.windowId) virtualKernel.exit(process.pid, 0);
      }
    });
    const unsubProcess = systemEventBus.on('process:terminated', ({ pid }) => {
      setWindows((prev) => {
        if (!prev.some((win) => win.pid === pid)) return prev;
        return focusWorkspace(prev.filter((win) => win.pid !== pid), sessionRef.current.activeWorkspace);
      });
    });

    const unsubOpenReq = systemEventBus.on('window:open_requested', (event: unknown) => {
      const e = event as { appId: string; props?: Record<string, unknown> };
      if (e?.appId) {
        openWindowRef.current(e.appId, e.props);
      }
    });

    return () => {
      mounted = false;
      unsubRestart();
      unsubShutdown();
      unsubAppClose();
      unsubOpenReq();
      unsubProcess();
    };
  }, []);

  useEffect(() => {
    if (!booted) return;
    const timer = setTimeout(() => SessionManager.saveSession(activeWorkspace, windows), 100);
    return () => clearTimeout(timer);
  }, [windows, activeWorkspace, booted]);

  useEffect(() => {
    const save = () => {
      const session = sessionRef.current;
      if (session.booted && !powerTransition.current) SessionManager.saveSession(session.activeWorkspace, session.windows);
      void vfs.flush();
    };
    const onVisibility = () => { if (document.hidden) save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    const announce = (status: ReturnType<typeof idbStorage.getPersistenceStatus>) => {
      if (status !== 'error' && status !== 'conflict' && status !== 'unavailable') return;
      setNotifications((prev) => [...prev.filter((notice) => notice.id !== 'persistence'), {
        id: 'persistence',
        title: 'AetherFS persistence',
        message: status === 'conflict' ? 'Another tab saved changes. Export any work in this tab before reloading.' :
          status === 'unavailable' ? 'Browser storage is unavailable. Export your work before closing AetherOS.' :
          'Browser storage could not save changes. Check available storage and export important files.',
        level: 'warning',
        read: false,
        timestamp: Date.now(),
      }]);
    };
    return idbStorage.subscribe(announce);
  }, []);

  // Update theme and persist to VFS
  const setTheme = useCallback((newTheme: Partial<SystemTheme>) => {
    setThemeState((prev) => {
      const updated = { ...prev, ...newTheme };
      try {
        if (vfs.exists('/home/aether/.config/aetheros')) {
          vfs.writeFile('/home/aether/.config/aetheros/theme.json', JSON.stringify(updated, null, 2));
        }
      } catch {}
      systemEventBus.emit('theme:changed', { theme: updated });
      return updated;
    });
  }, []);

  const setUser = useCallback((newUser: Partial<UserAccount>) => {
    setUserState((prev) => {
      const updated = { ...prev, ...newUser };
      systemEventBus.emit('user:switched', { user: updated });
      return updated;
    });
  }, []);

  // Notifications
  const addNotification = useCallback((notif: Omit<SystemNotification, 'id' | 'timestamp' | 'read'>) => {
    const full: SystemNotification = {
      ...notif,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications((prev) => [full, ...prev.slice(0, 49)]);
    audioService.playNotification();
    systemEventBus.emit('notification:created', { notification: full });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Focus Window
  const focusWindow = useCallback((id: string) => {
    const target = windows.find((w) => w.id === id);
    if (!target) {
      const pending = virtualKernel.getProcesses().find((process) => process.windowId === id);
      if (!pending) return;
    } else {
      setWorkspace(target.workspaceId);
    }

    setWindows((prev) => {
      const highestZ = Math.max(...prev.map((w) => w.zIndex), 0) + 1;
      return prev.map((w) =>
        w.id === id
          ? { ...w, zIndex: highestZ, isFocused: true, state: w.state === 'minimized' ? 'normal' : w.state }
          : { ...w, isFocused: false }
      );
    });
    systemEventBus.emit('window:focused', { windowId: id });
  }, [windows]);

  // Open Window (creates process in virtualKernel)
  const openWindow = useCallback(
    (appId: string, props?: Record<string, unknown>): string => {
      if (!booted || powerTransition.current) return '';
      const app = appRegistry.get(appId);
      if (!app) {
        systemLogger.error('window-manager', `Failed to open window: unknown app '${appId}'`);
        return '';
      }

      // Track recent apps
      setRecentApps((prev) => [appId, ...prev.filter((id) => id !== appId)].slice(0, 8));

      // Check singleton
      if (app.singleton) {
        const existing = virtualKernel.getProcesses().find((process) => process.appId === appId && process.windowId);
        if (existing?.windowId) {
          focusWindow(existing.windowId);
          return existing.windowId;
        }
      }

      const windowId = `win-${appId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

      // Spawn virtual process in kernel
      const proc = virtualKernel.spawn({
        name: app.name,
        command: app.executable || `/usr/bin/${appId}`,
        user: user.username,
        windowId,
        appId,
      });

      // Restore saved position/size if available
      const saved = savedWindowPositions.current[appId];
      const winWidth = saved
        ? Math.min(window.innerWidth - 40, saved.width)
        : Math.min(window.innerWidth - 60, app.defaultWidth || 800);
      const winHeight = saved
        ? Math.min(window.innerHeight - 60, saved.height)
        : Math.min(window.innerHeight - 100, app.defaultHeight || 550);

      const offset = (windows.length % 8) * 30;
      const defaultX = Math.max(20, Math.floor((window.innerWidth - winWidth) / 2) + offset);
      const defaultY = Math.max(30, Math.floor((window.innerHeight - winHeight) / 2) - 30 + offset);

      const startX = saved ? Math.max(10, Math.min(window.innerWidth - 100, saved.x)) : defaultX;
      const startY = saved ? Math.max(30, Math.min(window.innerHeight - 80, saved.y)) : defaultY;

      const newWindow: WindowInstance = {
        id: windowId,
        appId,
        pid: proc.pid,
        title: app.name,
        icon: app.icon,
        x: startX,
        y: startY,
        width: winWidth,
        height: winHeight,
        minWidth: app.minWidth || 350,
        minHeight: app.minHeight || 250,
        zIndex: 0,
        state: 'normal',
        workspaceId: activeWorkspace,
        isFocused: true,
        props,
      };

      setWindows((prev) => [...prev.map((w) => w.isFocused ? { ...w, isFocused: false } : w), {
        ...newWindow, zIndex: prev.reduce((max, win) => Math.max(max, win.zIndex), 10) + 1,
      }]);
      systemEventBus.emit('window:opened', { windowId, appId });
      audioService.playClick();

      return windowId;
    },
    [windows.length, user.username, activeWorkspace, focusWindow, booted]
  );

  useEffect(() => {
    openWindowRef.current = openWindow;
  }, [openWindow]);

  const closeGuards = React.useRef(new Map<string, () => boolean | Promise<boolean>>());
  const pendingCloses = React.useRef(new Set<string>());
  const registerCloseGuard = useCallback((id: string, guard: () => boolean | Promise<boolean>) => {
    closeGuards.current.set(id, guard);
    return () => { if (closeGuards.current.get(id) === guard) closeGuards.current.delete(id); };
  }, []);

  // Close Window (terminates process in kernel)
  const closeWindow = useCallback(
    async (id: string) => {
      if (pendingCloses.current.has(id)) return;
      const guard = closeGuards.current.get(id);
      if (guard) {
        pendingCloses.current.add(id);
        try {
          if (!await guard()) return;
        } catch {
          return;
        } finally {
          pendingCloses.current.delete(id);
        }
      }
      const target = sessionRef.current.windows.find((w) => w.id === id);
      if (target) {
        if (target.state === 'normal') {
          savedWindowPositions.current[target.appId] = {
            x: target.x,
            y: target.y,
            width: target.width,
            height: target.height,
          };
        }
        virtualKernel.exit(target.pid, 0);
      }

      setWindows((prev) => {
        const next = prev.filter((w) => w.id !== id);
        // If closed window was focused, focus the topmost remaining window on the active workspace
        if (target?.isFocused && next.length > 0) {
          const workspaceWins = next.filter(
            (w) => w.workspaceId === activeWorkspace && w.state !== 'minimized'
          );
          if (workspaceWins.length > 0) {
            const top = workspaceWins.reduce(
              (max, w) => (w.zIndex > max.zIndex ? w : max),
              workspaceWins[0]
            );
            return next.map((w) =>
              w.id === top.id ? { ...w, isFocused: true } : { ...w, isFocused: false }
            );
          }
        }
        return next;
      });

      systemEventBus.emit('window:closed', { windowId: id });
      audioService.playClick();
    },
    [activeWorkspace]
  );

  // Minimize Window
  const minimizeWindow = useCallback(
    (id: string) => {
      setWindows((prev) => {
        const target = prev.find((w) => w.id === id);
        const next = prev.map((w) =>
          w.id === id ? { ...w, state: 'minimized' as WindowDisplayState, isFocused: false } : w
        );
        if (target?.isFocused) {
          const workspaceWins = next.filter(
            (w) => w.workspaceId === activeWorkspace && w.state !== 'minimized'
          );
          if (workspaceWins.length > 0) {
            const top = workspaceWins.reduce(
              (max, w) => (w.zIndex > max.zIndex ? w : max),
              workspaceWins[0]
            );
            return next.map((w) =>
              w.id === top.id ? { ...w, isFocused: true } : { ...w, isFocused: false }
            );
          }
        }
        return next;
      });
    },
    [activeWorkspace]
  );

  // Maximize Window
  const maximizeWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          const nextState: WindowDisplayState = w.state === 'maximized' ? 'normal' : 'maximized';
          return { ...w, state: nextState };
        }
        return w;
      })
    );
    audioService.playSnap();
  }, []);

  // Snap Window (left / right / top)
  const snapWindow = useCallback((id: string, side: 'left' | 'right' | 'top') => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          if (side === 'top') {
            const nextState: WindowDisplayState = w.state === 'maximized' ? 'normal' : 'maximized';
            return { ...w, state: nextState };
          }
          const snapState: WindowDisplayState = side === 'left' ? 'snapped-left' : 'snapped-right';
          return { ...w, state: w.state === snapState ? 'normal' : snapState };
        }
        return w;
      })
    );
    audioService.playSnap();
  }, []);

  // Window position & size updates
  const updateWindowPosition = useCallback((id: string, x: number, y: number) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, x, y, state: 'normal' } : w))
    );
  }, []);

  const updateWindowSize = useCallback(
    (id: string, width: number, height: number, x?: number, y?: number) => {
      setWindows((prev) =>
        prev.map((w) => {
          if (w.id === id) {
            return {
              ...w,
              width: Math.max(w.minWidth, width),
              height: Math.max(w.minHeight, height),
              x: x !== undefined ? x : w.x,
              y: y !== undefined ? y : w.y,
              state: 'normal',
            };
          }
          return w;
        })
      );
    },
    []
  );

  const updateWindowMinimum = useCallback((id: string, width: number, height: number) => {
    const minWidth = Math.min(Math.max(100, Math.ceil(width)), Math.max(100, window.innerWidth - 20));
    const minHeight = Math.min(Math.max(80, Math.ceil(height)), Math.max(80, window.innerHeight - 50));
    setWindows((previous) => previous.map((win) => win.id !== id ||
      (win.minWidth === minWidth && win.minHeight === minHeight) ? win : {
      ...win, minWidth, minHeight, width: Math.max(win.width, minWidth), height: Math.max(win.height, minHeight),
    }));
  }, []);

  const updateWindowTitle = useCallback((id: string, title: string) => {
    setWindows((prev) => {
      const target = prev.find((w) => w.id === id);
      if (!target || target.title === title) return prev;
      return prev.map((w) => (w.id === id ? { ...w, title } : w));
    });
  }, []);

  const rebootSystem = useCallback(() => {
    systemEventBus.emit('system:restart', { timestamp: Date.now() });
  }, []);

  const shutdownSystem = useCallback(() => {
    systemEventBus.emit('system:shutdown', { timestamp: Date.now() });
  }, []);

  const powerOnSystem = useCallback(() => {
    systemEventBus.emit('system:restart', { timestamp: Date.now() });
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLocked) return;

      // Workspace switching: Alt + 1..4
      if (e.altKey && !e.ctrlKey && !e.shiftKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        setActiveWorkspace(parseInt(e.key, 10));
        return;
      }

      // Alt + Tab (Window switching)
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        if (windows.length <= 1) return;
        const currentFocusedIdx = windows.findIndex((w) => w.isFocused);
        const nextIdx = (currentFocusedIdx + 1) % windows.length;
        const nextWindow = windows[nextIdx];
        if (nextWindow) {
          focusWindow(nextWindow.id);
        }
        return;
      }

      // Alt + Space (Quick Runner / Command Palette)
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        setQuickRunnerOpen((prev) => !prev);
        return;
      }

      // Super + E (File Manager)
      if ((e.metaKey || (e.ctrlKey && e.altKey)) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        openWindow('file-manager');
        return;
      }

      // Super + T or Ctrl + Alt + T (Terminal)
      if (
        ((e.metaKey || (e.ctrlKey && e.altKey)) && (e.key === 't' || e.key === 'T')) ||
        (e.ctrlKey && e.altKey && (e.key === 't' || e.key === 'T'))
      ) {
        e.preventDefault();
        openWindow('terminal');
        return;
      }

      // Alt + W or Alt + F4 (Close focused window)
      if (e.altKey && (e.key === 'F4' || e.key.toLowerCase() === 'w')) {
        e.preventDefault();
        const focused = windows.find((w) => w.isFocused);
        if (focused) {
          closeWindow(focused.id);
        }
        return;
      }

      // Window Snapping / Maximizing Shortcuts:
      // Alt + Left Arrow -> Snap Left
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        const focused = windows.find((w) => w.isFocused);
        if (focused) snapWindow(focused.id, 'left');
        return;
      }

      // Alt + Right Arrow -> Snap Right
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        const focused = windows.find((w) => w.isFocused);
        if (focused) snapWindow(focused.id, 'right');
        return;
      }

      // Alt + Up Arrow -> Maximize
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        const focused = windows.find((w) => w.isFocused);
        if (focused) maximizeWindow(focused.id);
        return;
      }

      // Alt + Down Arrow -> Restore / Minimize
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        const focused = windows.find((w) => w.isFocused);
        if (focused) {
          if (focused.state === 'maximized' || focused.state === 'snapped-left' || focused.state === 'snapped-right') {
            maximizeWindow(focused.id); // restores to normal
          } else {
            minimizeWindow(focused.id);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [windows, isLocked, focusWindow, closeWindow, openWindow, snapWindow, maximizeWindow, minimizeWindow, setActiveWorkspace]);

  const value = useMemo<SystemContextValue>(
    () => ({
      booted,
      theme,
      setTheme,
      user,
      setUser,
      isLocked,
      setIsLocked,
      notifications,
      addNotification,
      dismissNotification,
      clearNotifications,
      windows,
      openWindow,
      closeWindow,
      registerCloseGuard,
      focusWindow,
      minimizeWindow,
      maximizeWindow,
      snapWindow,
      updateWindowPosition,
      updateWindowSize,
      updateWindowMinimum,
      updateWindowTitle,
      recentApps,
      activeWorkspace,
      setActiveWorkspace,
      appLauncherOpen,
      setAppLauncherOpen,
      quickRunnerOpen,
      setQuickRunnerOpen,
      quickSettingsOpen,
      setQuickSettingsOpen,
      notificationCenterOpen,
      setNotificationCenterOpen,
      rebootSystem,
      shutdownSystem,
      isPoweredOff,
      powerOnSystem,
    }),
    [
      booted,
      theme,
      setTheme,
      user,
      setUser,
      isLocked,
      notifications,
      addNotification,
      dismissNotification,
      clearNotifications,
      windows,
      openWindow,
      closeWindow,
      registerCloseGuard,
      focusWindow,
      minimizeWindow,
      maximizeWindow,
      snapWindow,
      updateWindowPosition,
      updateWindowSize,
      updateWindowMinimum,
      updateWindowTitle,
      recentApps,
      activeWorkspace,
      setActiveWorkspace,
      appLauncherOpen,
      quickRunnerOpen,
      quickSettingsOpen,
      notificationCenterOpen,
      rebootSystem,
      shutdownSystem,
      isPoweredOff,
      powerOnSystem,
    ]
  );

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
};

