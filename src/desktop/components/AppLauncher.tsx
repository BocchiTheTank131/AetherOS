// AetherOS - Application Launcher (Start Menu) Component
import React, { useState, useEffect, useRef } from 'react';
import { useSystem } from '../../core/context';
import { appRegistry } from '../../apps/appRegistry';
import type { AppDefinition } from '../../apps/types';
import {
  Search,
  Lock,
  RotateCcw,
  Power,
  User,
  Terminal,
  Folder,
  FileText,
  Code2,
  Globe,
  Settings,
  Activity,
  Package,
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
  Clock,
} from 'lucide-react';

export const AppLauncher: React.FC = () => {
  const {
    appLauncherOpen,
    setAppLauncherOpen,
    openWindow,
    user,
    setIsLocked,
    rebootSystem,
    shutdownSystem,
    theme,
    recentApps,
  } = useSystem();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (appLauncherOpen) {
      searchInputRef.current?.focus();
      setSearch('');
    }
  }, [appLauncherOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('[title="Applications Menu (Super)"]')
      ) {
        setAppLauncherOpen(false);
      }
    };

    if (appLauncherOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [appLauncherOpen, setAppLauncherOpen]);

  // Reset selection index when search or category changes
  useEffect(() => {
    setSelectedIndex(search ? 0 : -1);
  }, [search, selectedCategory]);

  if (!appLauncherOpen) return null;

  const getAppIcon = (iconName: string) => {
    const cls = 'w-7 h-7 text-cyan-400 group-hover:scale-110 transition-transform';
    switch (iconName) {
      case 'Terminal':
        return <Terminal className={cls} />;
      case 'Folder':
        return <Folder className={cls} />;
      case 'FileText':
        return <FileText className={cls} />;
      case 'Code2':
        return <Code2 className={cls} />;
      case 'Globe':
        return <Globe className={cls} />;
      case 'Settings':
        return <Settings className={cls} />;
      case 'Activity':
        return <Activity className={cls} />;
      case 'Package':
        return <Package className={cls} />;
      case 'Calculator':
        return <Calculator className={cls} />;
      case 'PlayCircle':
        return <PlayCircle className={cls} />;
      case 'Image':
        return <ImageIcon className={cls} />;
      case 'StickyNote':
        return <StickyNote className={cls} />;
      case 'BookOpen':
        return <BookOpen className={cls} />;
      case 'ScrollText':
        return <ScrollText className={cls} />;
      case 'Bomb':
        return <Bomb className={cls} />;
      case 'Grid':
        return <Grid className={cls} />;
      case 'Palette':
        return <Palette className={cls} />;
      case 'CloudRain':
        return <CloudRain className={cls} />;
      case 'Mic':
        return <Mic className={cls} />;
      default:
        return <Activity className={cls} />;
    }
  };

  const allApps = appRegistry.getAll();
  const categories = ['All', 'System', 'Accessories', 'Development', 'Media', 'Internet', 'Games'];

  const recentAppDefs = recentApps
    .map((id) => appRegistry.get(id))
    .filter((app): app is AppDefinition => !!app)
    .slice(0, 4);

  const filteredApps = allApps.filter((app) => {
    if (selectedCategory !== 'All' && app.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        app.name.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleLaunch = (app: AppDefinition) => {
    openWindow(app.id);
    setAppLauncherOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`fixed z-[9995] select-none rounded-2xl border border-gray-700/70 shadow-2xl overflow-hidden flex flex-col ${
        theme.blur ? 'glass-panel' : 'bg-[#141926]'
      } ${
        theme.dockPosition === 'top'
          ? 'top-12 left-4 w-[600px] h-[520px]'
          : theme.dockPosition === 'left'
          ? 'left-16 bottom-4 w-[600px] h-[520px]'
          : 'bottom-12 left-4 w-[600px] h-[520px]'
      }`}
    >
      {/* Search Input Bar */}
      <div className="p-3 border-b border-gray-700/60 bg-[#161c2b]/70">
        <div className="flex items-center gap-2.5 bg-[#0f1420] border border-gray-700 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-cyan-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(filteredApps.length - 1, prev + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(0, prev - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const target =
                  selectedIndex >= 0 && selectedIndex < filteredApps.length
                    ? filteredApps[selectedIndex]
                    : filteredApps[0];
                if (target) {
                  handleLaunch(target);
                }
              }
            }}
            placeholder="Type to search apps, files, commands..."
            className="w-full bg-transparent text-white text-xs outline-none placeholder-gray-400 font-sans"
          />
        </div>
      </div>

      {/* Main Split: Categories Sidebar + App Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Categories Sidebar */}
        <div className="w-36 bg-[#111622]/80 border-r border-gray-800 p-2 space-y-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* App Grid */}
        <div className="flex-1 p-3 overflow-y-auto">
          {/* Recent Applications Row */}
          {!search && selectedCategory === 'All' && recentAppDefs.length > 0 && (
            <div className="mb-3 pb-2 border-b border-gray-800">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Recent Applications</span>
              </div>
              <div className="flex gap-2">
                {recentAppDefs.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => handleLaunch(app)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-800/80 hover:bg-cyan-500/20 border border-gray-700/60 transition-colors text-xs text-gray-200"
                  >
                    <div className="w-4 h-4">{getAppIcon(app.icon)}</div>
                    <span className="truncate max-w-[85px]">{app.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredApps.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs">
              No matching applications found
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {filteredApps.map((app, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <button
                    key={app.id}
                    onClick={() => handleLaunch(app)}
                    className={`flex flex-col items-center text-center p-3 rounded-xl transition-all group border ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-500/20 shadow-md ring-1 ring-cyan-400/50'
                        : 'border-transparent hover:bg-gray-800/60 hover:border-gray-700/60'
                    }`}
                  >
                    <div className="p-2.5 bg-gray-800/80 rounded-xl mb-2 group-hover:bg-cyan-500/20 transition-colors shadow">
                      {getAppIcon(app.icon)}
                    </div>
                    <span className="text-xs font-semibold text-gray-200 group-hover:text-cyan-300 truncate max-w-[120px]">
                      {app.name}
                    </span>
                    <span className="text-[10px] text-gray-400 truncate max-w-[120px] mt-0.5">
                      {app.description}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom User Bar & Power Controls */}
      <div className="flex items-center justify-between p-3 bg-[#111622] border-t border-gray-800 text-xs text-gray-300">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300 font-bold">
            <User className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-white block text-xs">{user.displayName}</span>
            <span className="text-[10px] text-gray-400">@{user.username}</span>
          </div>
        </div>

        {/* Power Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setIsLocked(true);
              setAppLauncherOpen(false);
            }}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
            title="Lock Session"
          >
            <Lock className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              rebootSystem();
              setAppLauncherOpen(false);
            }}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
            title="Restart AetherOS"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              shutdownSystem();
              setAppLauncherOpen(false);
            }}
            className="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400"
            title="Shut Down"
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
