import React, { useState, useEffect, useRef } from 'react';
import { Bell, ChevronUp, SlidersHorizontal, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { appRegistry } from '../../apps/appRegistry';
import { audioService } from '../../core/audio';
import { useSystem } from '../../core/context';
import { AppIcon } from './AppIcon';
import { GlassLens } from './GlassLens';

const pinned = ['file-manager', 'terminal', 'code-studio', 'text-editor', 'web-browser', 'software-center', 'system-monitor', 'settings'];
const dockNames: Record<string, string> = { 'web-browser': 'Browser', 'software-center': 'Software', 'system-monitor': 'Monitor' };

export const Taskbar: React.FC = () => {
  const {
    theme, glassEffects, windows, openWindow, focusWindow, minimizeWindow, activeWorkspace, setActiveWorkspace,
    appLauncherOpen, setAppLauncherOpen, quickSettingsOpen, setQuickSettingsOpen,
    notificationCenterOpen, setNotificationCenterOpen, notifications,
  } = useSystem();
  const [time, setTime] = useState(() => new Date());
  const [isMuted, setIsMuted] = useState(() => audioService.isSoundMuted());
  const [isOnline, setOnline] = useState(() => navigator.onLine);
  const [revealed, setRevealed] = useState(false);
  const [tip, setTip] = useState<{ name: string; x: number; y: number } | null>(null);
  const dock = useRef<HTMLElement>(null);

  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine);
    const timer = setInterval(() => {
      setTime(new Date());
      setIsMuted(audioService.isSoundMuted());
    }, 1000);
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  }, []);

  const appIds = new Set([...pinned, ...windows.map((win) => win.appId)]);
  const unread = notifications.filter((notification) => !notification.read).length;

  const toggleQuickSettings = () => {
    setQuickSettingsOpen((prev) => !prev);
    setAppLauncherOpen(false);
    setNotificationCenterOpen(false);
  };

  const handleAppClick = (appId: string) => {
    const matches = windows.filter((win) => win.appId === appId);
    const local = matches.filter((win) => win.workspaceId === activeWorkspace);
    const candidates = local.length ? local : matches;
    const focused = candidates.findIndex((win) => win.isFocused);
    if (!candidates.length) openWindow(appId);
    else if (focused < 0) focusWindow(candidates[candidates.length - 1].id);
    else if (candidates.length === 1) minimizeWindow(candidates[0].id);
    else focusWindow(candidates[(focused + 1) % candidates.length].id);
    setTip(null);
  };

  const showTip = (name: string, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    const x = theme.dockPosition === 'left' ? rect.right + 15 : rect.left + rect.width / 2;
    const y = theme.dockPosition === 'top' ? rect.bottom + 15
      : theme.dockPosition === 'left' ? rect.top + rect.height / 2 : rect.top - 15;
    setTip({ name, x, y });
  };

  return (
    <div className="dock-anchor" data-expanded={revealed || appLauncherOpen || quickSettingsOpen || notificationCenterOpen}>
      <GlassLens surface={dock} enabled={glassEffects} bevel={20} />
      {theme.dockAutoHide && (
        <button
          className="dock-reveal"
          aria-label="Show dock"
          onPointerEnter={(event) => { if (event.pointerType === 'mouse') setRevealed(true); }}
          onClick={() => setRevealed(true)}
        ><ChevronUp size={16} aria-hidden="true" /></button>
      )}
      <nav
        ref={dock}
        aria-label="Dock"
        className="dock ui-material glass-clear glass-rim"
        onPointerLeave={() => { setTip(null); setRevealed(false); }}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setRevealed(false); }}
      >
        <div className="dock-section dock-start">
          <button
            className="dock-launch glass-interactive"
            aria-label="Applications"
            aria-expanded={appLauncherOpen}
            title="Applications Menu (Super)"
            onClick={() => {
              setAppLauncherOpen((prev) => !prev);
              setQuickSettingsOpen(false);
              setNotificationCenterOpen(false);
              audioService.playClick();
            }}
          ><span className="aether-mark" aria-hidden="true" /></button>
          <div className="dock-workspaces" role="group" aria-label="Workspaces">
            {[1, 2, 3, 4].map((id) => (
              <button key={id} title={`Workspace ${id}`} aria-label={`Workspace ${id}`} aria-pressed={activeWorkspace === id} onClick={() => setActiveWorkspace(id)}>{id}</button>
            ))}
          </div>
        </div>
        <div className="dock-apps" onScroll={() => setTip(null)} onWheel={(event) => {
          if (theme.dockPosition !== 'left' && !event.ctrlKey && event.deltaX === 0) {
            event.currentTarget.scrollLeft += event.deltaY;
          }
        }}>
          {[...appIds].map((id) => {
            const app = appRegistry.get(id);
            if (!app) return null;
            const name = dockNames[id] ?? app.name;
            const running = windows.some((win) => win.appId === id);
            const focused = windows.some((win) => win.appId === id && win.isFocused && win.workspaceId === activeWorkspace);
            return (
              <button
                key={id} title={name} aria-label={name} className="dock-app"
                data-focused={focused} data-running={running}
                onClick={() => handleAppClick(id)}
                onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) showTip(name, event.currentTarget); }}
                onBlur={() => setTip(null)}
                onPointerEnter={(event) => { if (event.pointerType === 'mouse') showTip(name, event.currentTarget); }}
                onPointerLeave={() => setTip(null)}
              ><AppIcon name={app.icon} size={22} tile /></button>
            );
          })}
        </div>
        <div className="dock-section dock-status">
          <span className="dock-network" title={isOnline ? 'Online' : 'Offline'}>{isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}</span>
          <button className="dock-system-button dock-volume" title="Volume Toggle" aria-label={isMuted ? 'Unmute' : 'Mute'} onClick={() => setIsMuted(audioService.toggleMute())}>
            {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button className="dock-system-button" title="Notifications" aria-label="Notifications" aria-expanded={notificationCenterOpen} onClick={() => {
            setNotificationCenterOpen((prev) => !prev);
            setQuickSettingsOpen(false);
            setAppLauncherOpen(false);
          }}>
            <Bell size={17} />
            {unread > 0 && <span className="dock-unread" aria-label={`${unread} unread`} />}
          </button>
          <button className="dock-system-button glass-interactive" title="Quick Settings" aria-label="Quick Settings" aria-expanded={quickSettingsOpen} onClick={toggleQuickSettings}>
            <SlidersHorizontal size={17} />
          </button>
          <button className="dock-clock" aria-label="Open Quick Settings from clock" aria-expanded={quickSettingsOpen} onClick={toggleQuickSettings}>
            <span>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span>{time.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
          </button>
        </div>
      </nav>
      {tip && <div className="dock-tip ui-material" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.name}</div>}
    </div>
  );
};
