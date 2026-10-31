// AetherOS - Taskbar / Dock Panel Component
import React, { useState, useEffect } from 'react';
import { useSystem } from '../../core/context';
import { audioService } from '../../core/audio';
import { appRegistry } from '../../apps/appRegistry';
import {
  Terminal,
  Folder,
  FileText,
  Code2,
  Globe,
  Settings,
  Activity,
  Package,
  Volume2,
  VolumeX,
  Wifi,
  Bell,
  Sliders,
  Calculator,
  PlayCircle,
  Image as ImageIcon,
  StickyNote,
  BookOpen,
  ScrollText,
  Bomb,
  Grid,
  Palette,
  CloudRain,
  Mic,
  AppWindow,
} from 'lucide-react';

export const Taskbar: React.FC = () => {
  const {
    theme,
    windows,
    openWindow,
    focusWindow,
    minimizeWindow,
    appLauncherOpen,
    setAppLauncherOpen,
    quickSettingsOpen,
    setQuickSettingsOpen,
    setNotificationCenterOpen,
    notifications,
    activeWorkspace,
    setActiveWorkspace,
  } = useSystem();

  const [time, setTime] = useState(() => new Date());
  const [isMuted, setIsMuted] = useState(audioService.isSoundMuted());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
      setIsMuted(audioService.isSoundMuted());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const pinnedApps = [
    { id: 'terminal', name: 'Terminal', icon: <Terminal className="w-5 h-5 text-cyan-400" /> },
    { id: 'file-manager', name: 'Files', icon: <Folder className="w-5 h-5 text-blue-400" /> },
    { id: 'code-studio', name: 'Code Studio', icon: <Code2 className="w-5 h-5 text-emerald-400" /> },
    { id: 'text-editor', name: 'Text Editor', icon: <FileText className="w-5 h-5 text-amber-400" /> },
    { id: 'web-browser', name: 'Browser', icon: <Globe className="w-5 h-5 text-purple-400" /> },
    { id: 'software-center', name: 'Software', icon: <Package className="w-5 h-5 text-pink-400" /> },
    { id: 'system-monitor', name: 'Monitor', icon: <Activity className="w-5 h-5 text-rose-400" /> },
    { id: 'settings', name: 'Settings', icon: <Settings className="w-5 h-5 text-gray-300" /> },
  ];

  const getDynamicAppIcon = (appId: string) => {
    const appDef = appRegistry.getApp(appId);
    const iconName = appDef?.icon;
    switch (iconName) {
      case 'Calculator':
        return <Calculator className="w-5 h-5 text-indigo-400" />;
      case 'PlayCircle':
        return <PlayCircle className="w-5 h-5 text-red-400" />;
      case 'Image':
        return <ImageIcon className="w-5 h-5 text-teal-400" />;
      case 'StickyNote':
        return <StickyNote className="w-5 h-5 text-amber-300" />;
      case 'BookOpen':
        return <BookOpen className="w-5 h-5 text-blue-400" />;
      case 'ScrollText':
        return <ScrollText className="w-5 h-5 text-slate-300" />;
      case 'Bomb':
        return <Bomb className="w-5 h-5 text-rose-500" />;
      case 'Grid':
        return <Grid className="w-5 h-5 text-amber-500" />;
      case 'Palette':
        return <Palette className="w-5 h-5 text-pink-400" />;
      case 'CloudRain':
        return <CloudRain className="w-5 h-5 text-sky-400" />;
      case 'Mic':
        return <Mic className="w-5 h-5 text-red-400" />;
      default:
        return <AppWindow className="w-5 h-5 text-cyan-300" />;
    }
  };

  // Collect unpinned open apps
  const unpinnedRunningAppIds = Array.from(
    new Set(windows.map((w) => w.appId).filter((id) => !pinnedApps.some((p) => p.id === id)))
  );

  const allDisplayApps = [
    ...pinnedApps,
    ...unpinnedRunningAppIds.map((id) => {
      const def = appRegistry.getApp(id);
      return {
        id,
        name: def?.name || id,
        icon: getDynamicAppIcon(id),
      };
    }),
  ];

  const handleAppClick = (appId: string) => {
    const matchingWins = windows.filter((w) => w.appId === appId);
    if (matchingWins.length === 0) {
      openWindow(appId);
      return;
    }
    const focusedWin = matchingWins.find((w) => w.isFocused);
    if (focusedWin) {
      minimizeWindow(focusedWin.id);
    } else {
      const target = matchingWins[matchingWins.length - 1];
      focusWindow(target.id);
    }
  };

  const handleToggleMute = () => {
    audioService.toggleMute();
    setIsMuted(audioService.isSoundMuted());
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div
      className={`fixed z-[9990] flex items-center justify-between select-none transition-all ${
        theme.dockPosition === 'top'
          ? 'top-0 inset-x-0 h-11 border-b'
          : theme.dockPosition === 'left'
          ? 'left-0 inset-y-0 w-14 flex-col border-r py-3'
          : 'bottom-0 inset-x-0 h-11 border-t'
      } ${
        theme.blur ? 'glass-panel' : 'bg-[#121622]'
      } border-gray-700/60 px-3 shadow-2xl`}
    >
      {/* Left: Start Menu Button & Workspace Switcher */}
      <div className={`flex items-center gap-2 ${theme.dockPosition === 'left' ? 'flex-col' : ''}`}>
        {/* AetherOS Start Button */}
        <button
          onClick={() => {
            setAppLauncherOpen((prev) => !prev);
            setQuickSettingsOpen(false);
            setNotificationCenterOpen(false);
            audioService.playClick();
          }}
          className={`flex items-center justify-center p-1.5 rounded-xl transition-all duration-200 group ${
            appLauncherOpen
              ? 'bg-cyan-500/30 ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/20'
              : 'hover:bg-cyan-500/10'
          }`}
          title="Applications Menu (Super)"
        >
          {/* Custom Stylized AetherOS Icon */}
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            <div className="w-3.5 h-3.5 border-2 border-white rounded rotate-45" />
          </div>
        </button>

        {/* Workspaces */}
        <div className="flex items-center gap-1 bg-[#111624]/60 p-1 rounded-lg border border-gray-700/50">
          {[1, 2, 3, 4].map((ws) => (
            <button
              key={ws}
              onClick={() => setActiveWorkspace(ws)}
              className={`w-5 h-5 rounded text-[11px] font-bold transition-colors ${
                activeWorkspace === ws
                  ? 'bg-cyan-500 text-black shadow'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
              }`}
              title={`Workspace ${ws}`}
            >
              {ws}
            </button>
          ))}
        </div>
      </div>

      {/* Center: Running & Pinned Apps */}
      <div
        className={`flex items-center gap-1.5 overflow-x-auto ${
          theme.dockPosition === 'left' ? 'flex-col' : ''
        }`}
      >
        {allDisplayApps.map((app) => {
          const matchingWins = windows.filter((w) => w.appId === app.id);
          const isRunning = matchingWins.length > 0;
          const isFocused = matchingWins.some((w) => w.isFocused);

          return (
            <button
              key={app.id}
              onClick={() => handleAppClick(app.id)}
              className={`relative flex items-center justify-center p-2 rounded-xl transition-all duration-150 ${
                isFocused
                  ? 'bg-cyan-500/20 border border-cyan-500/50 shadow-md'
                  : isRunning
                  ? 'bg-gray-800/80 hover:bg-gray-700/80'
                  : 'hover:bg-gray-800/50'
              }`}
              title={app.name}
            >
              {app.icon}
              {isRunning && (
                <span
                  className={`absolute bottom-0.5 w-1.5 h-1.5 rounded-full ${
                    isFocused ? 'bg-cyan-400 ring-2 ring-cyan-400/30' : 'bg-gray-400'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Right: System Tray & Clock */}
      <div className={`flex items-center gap-2 ${theme.dockPosition === 'left' ? 'flex-col' : ''}`}>
        {/* Network & Audio Status */}
        <div className="flex items-center gap-1 text-gray-300">
          <button
            onClick={handleToggleMute}
            className="p-1.5 hover:bg-gray-700/60 rounded-lg text-gray-300 hover:text-white"
            title="Volume Toggle"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <div className="p-1.5 text-gray-300" title="Connected (Online)">
            <Wifi className="w-4 h-4 text-emerald-400" />
          </div>
        </div>

        {/* Notifications Bell */}
        <button
          onClick={() => {
            setNotificationCenterOpen((prev) => !prev);
            setQuickSettingsOpen(false);
            setAppLauncherOpen(false);
          }}
          className="relative p-1.5 hover:bg-gray-700/60 rounded-lg text-gray-300 hover:text-white"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-black" />
          )}
        </button>

        {/* Quick Settings Sliders Toggle */}
        <button
          onClick={() => {
            setQuickSettingsOpen((prev) => !prev);
            setAppLauncherOpen(false);
            setNotificationCenterOpen(false);
          }}
          className={`p-1.5 rounded-lg transition-colors ${
            quickSettingsOpen ? 'bg-cyan-500/20 text-cyan-400' : 'hover:bg-gray-700/60 text-gray-300'
          }`}
          title="Quick Settings"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Clock & Date */}
        <div
          onClick={() => {
            setQuickSettingsOpen((prev) => !prev);
          }}
          className="cursor-pointer px-2.5 py-1 rounded-lg hover:bg-gray-700/50 flex flex-col items-end text-right"
        >
          <span className="text-xs font-semibold text-white tracking-wide">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">
            {time.toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
    </div>
  );
};
