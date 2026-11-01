// AetherOS - Application Launcher (Start Menu) Component
import React, { useState, useEffect, useRef } from 'react';
import { useSystem } from '../../core/context';
import { appRegistry } from '../../apps/appRegistry';
import type { AppDefinition } from '../../apps/types';
import { dialogService } from '../../core/dialog';
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
  const [, setRegistryVersion] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-render when dynamic packages are installed or removed
  useEffect(() => {
    return appRegistry.subscribe(() => {
      setRegistryVersion((v) => v + 1);
    });
  }, []);

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

  const getAppIcon = (iconName: string, customCls?: string, size?: number) => {
    const cls = customCls || 'w-7 h-7 text-cyan-400 group-hover:scale-110 transition-transform';
    const props = {
      className: cls,
      ...(size ? { size, style: { width: size, height: size, minWidth: size, minHeight: size } } : {}),
    };
    switch (iconName) {
      case 'Terminal':
        return <Terminal {...props} />;
      case 'Folder':
        return <Folder {...props} />;
      case 'FileText':
        return <FileText {...props} />;
      case 'Code2':
        return <Code2 {...props} />;
      case 'Globe':
        return <Globe {...props} />;
      case 'Settings':
        return <Settings {...props} />;
      case 'Activity':
        return <Activity {...props} />;
      case 'Package':
        return <Package {...props} />;
      case 'Calculator':
        return <Calculator {...props} />;
      case 'PlayCircle':
        return <PlayCircle {...props} />;
      case 'Image':
        return <ImageIcon {...props} />;
      case 'StickyNote':
        return <StickyNote {...props} />;
      case 'BookOpen':
        return <BookOpen {...props} />;
      case 'ScrollText':
        return <ScrollText {...props} />;
      case 'Bomb':
        return <Bomb {...props} />;
      case 'Grid':
        return <Grid {...props} />;
      case 'Palette':
        return <Palette {...props} />;
      case 'CloudRain':
        return <CloudRain {...props} />;
      case 'Mic':
        return <Mic {...props} />;
      default:
        if (iconName && (iconName.startsWith('data:') || iconName.includes('/'))) {
          return <img src={iconName} className={cls} style={size ? { width: size, height: size } : undefined} alt="" />;
        }
        return <Package {...props} />;
    }
  };

  const allApps = appRegistry.getAll();
  const categories = ['All', 'System', 'Accessories', 'Development', 'Media', 'Internet', 'Games', 'Utilities'];

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

  const isLight = theme.mode === 'light';

  return (
    <div
      ref={containerRef}
      className={`fixed z-[9995] select-none rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
        isLight
          ? theme.blur
            ? 'glass-panel-light text-slate-900 border-slate-300'
            : 'bg-white text-slate-900 border-slate-300'
          : theme.blur
          ? 'glass-panel text-white border-gray-700/70'
          : 'bg-[#141926] text-white border-gray-700/70'
      } ${
        theme.dockPosition === 'top'
          ? 'top-12 left-4 w-[600px] h-[520px]'
          : theme.dockPosition === 'left'
          ? 'left-16 bottom-4 w-[600px] h-[520px]'
          : 'bottom-12 left-4 w-[600px] h-[520px]'
      }`}
    >
      {/* Search Input Bar */}
      <div className={`p-3 border-b ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#161c2b]/70 border-gray-700/60'}`}>
        <div className={`flex items-center gap-2.5 border rounded-xl px-3 py-2 ${
          isLight ? 'bg-white border-slate-300' : 'bg-[#0f1420] border-gray-700'
        }`}>
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
            className={`w-full bg-transparent text-xs outline-none font-sans ${
              isLight ? 'text-slate-900 placeholder-slate-400' : 'text-white placeholder-gray-400'
            }`}
          />
        </div>
      </div>

      {/* Main Split: Categories Sidebar + App Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Categories Sidebar */}
        <div className={`w-36 border-r p-2 space-y-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#111622]/80 border-gray-800'}`}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-cyan-500/20 text-cyan-500 font-semibold'
                  : isLight
                  ? 'text-slate-600 hover:text-black hover:bg-slate-200'
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
            <div className={`mb-3 pb-2 border-b ${isLight ? 'border-slate-200' : 'border-gray-800'}`}>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Recent Applications</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recentAppDefs.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => handleLaunch(app)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-xs ${
                      isLight
                        ? 'bg-slate-100 hover:bg-cyan-50 border-slate-300 text-slate-800'
                        : 'bg-gray-800/80 hover:bg-cyan-500/20 border-gray-700/60 text-gray-200'
                    }`}
                  >
                    <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
                      {getAppIcon(app.icon, 'w-3.5 h-3.5 text-cyan-400', 14)}
                    </div>
                    <span className="truncate max-w-[85px]">{app.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredApps.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs">
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
                        : isLight
                        ? 'border-transparent hover:bg-slate-100 hover:border-slate-200'
                        : 'border-transparent hover:bg-gray-800/60 hover:border-gray-700/60'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl mb-2 transition-colors shadow ${
                      isLight
                        ? 'bg-slate-100 group-hover:bg-cyan-50'
                        : 'bg-gray-800/80 group-hover:bg-cyan-500/20'
                    }`}>
                      {getAppIcon(app.icon)}
                    </div>
                    <span className={`text-xs font-semibold truncate max-w-[120px] ${
                      isLight ? 'text-slate-800 group-hover:text-cyan-600' : 'text-gray-200 group-hover:text-cyan-300'
                    }`}>
                      {app.name}
                    </span>
                    <span className={`text-[10px] truncate max-w-[120px] mt-0.5 ${
                      isLight ? 'text-slate-500' : 'text-gray-400'
                    }`}>
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
      <div className={`flex items-center justify-between p-3 border-t text-xs ${
        isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-[#111622] border-gray-800 text-gray-300'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-400 font-bold">
            <User className="w-4 h-4" />
          </div>
          <div>
            <span className={`font-semibold block text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{user.displayName}</span>
            <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>@{user.username}</span>
          </div>
        </div>

        {/* Power Actions with Safety Confirmations */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setIsLocked(true);
              setAppLauncherOpen(false);
            }}
            className={`p-2 rounded-lg transition-colors ${
              isLight ? 'hover:bg-slate-200 text-slate-600 hover:text-black' : 'hover:bg-gray-800 text-gray-400 hover:text-white'
            }`}
            title="Lock Session"
          >
            <Lock className="w-4 h-4" />
          </button>
          <button
            onClick={async () => {
              setAppLauncherOpen(false);
              const ok = await dialogService.confirm({
                title: 'Restart AetherOS',
                message: 'Are you sure you want to reboot AetherOS? Any unsaved work should be saved first.',
                confirmText: 'Restart',
                danger: true,
              });
              if (ok) rebootSystem();
            }}
            className={`p-2 rounded-lg transition-colors ${
              isLight ? 'hover:bg-slate-200 text-slate-600 hover:text-black' : 'hover:bg-gray-800 text-gray-400 hover:text-white'
            }`}
            title="Restart AetherOS"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={async () => {
              setAppLauncherOpen(false);
              const ok = await dialogService.confirm({
                title: 'Power Off System',
                message: 'Are you sure you want to shut down AetherOS?',
                confirmText: 'Shut Down',
                danger: true,
              });
              if (ok) shutdownSystem();
            }}
            className="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
            title="Shut Down"
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
