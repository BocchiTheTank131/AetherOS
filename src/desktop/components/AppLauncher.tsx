import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Lock, Power, RotateCcw, Search, UserRound } from 'lucide-react';
import { useSystem } from '../../core/context';
import { dialogService } from '../../core/dialog';
import { appRegistry } from '../../apps/appRegistry';
import type { AppDefinition } from '../../apps/types';
import { AppIcon } from './AppIcon';

export function AppLauncher() {
  const { appLauncherOpen } = useSystem();
  return appLauncherOpen ? <AppLauncherContent /> : null;
}

function AppLauncherContent() {
  const { setAppLauncherOpen, openWindow, user, setIsLocked, rebootSystem, shutdownSystem, recentApps } = useSystem();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All apps');
  const [selected, setSelected] = useState(-1);
  const [, setRegistryVersion] = useState(0);
  const container = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);

  useEffect(() => appRegistry.subscribe(() => setRegistryVersion((version) => version + 1)), []);

  useEffect(() => {
    searchInput.current?.focus({ preventScroll: true });
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !container.current?.contains(target) && !target.closest('.dock-launch')) {
        setAppLauncherOpen(false);
      }
    };
    window.addEventListener('pointerdown', closeOutside);
    return () => window.removeEventListener('pointerdown', closeOutside);
  }, [setAppLauncherOpen]);

  const apps = appRegistry.getAll();
  const categories = ['All apps', ...new Set(apps.map((app) => app.category))];
  const query = search.trim().toLowerCase();
  const filtered = apps.filter((app) => query
    ? [app.name, app.description, app.id].some((value) => value.toLowerCase().includes(query))
    : category === 'All apps' || app.category === category);
  const recent = recentApps.map((id) => appRegistry.get(id)).filter((app): app is AppDefinition => Boolean(app)).slice(0, 4);

  const launch = (app: AppDefinition) => {
    openWindow(app.id);
    setAppLauncherOpen(false);
  };

  const power = async (restart: boolean) => {
    setAppLauncherOpen(false);
    if (await dialogService.confirm({
      title: restart ? 'Restart AetherOS' : 'Shut down AetherOS',
      message: restart ? 'Save your work before restarting AetherOS.' : 'Save your work before shutting down AetherOS.',
      confirmText: restart ? 'Restart' : 'Shut down',
      danger: true,
    })) {
      if (restart) rebootSystem();
      else shutdownSystem();
    }
  };

  return (
    <section className="application-launcher shell-panel shell-panel-start ui-panel ui-material" ref={container} aria-label="Applications" onKeyDown={(event) => {
      if (event.key !== 'Escape') return;
      setAppLauncherOpen(false);
      document.querySelector<HTMLButtonElement>('.dock-launch')?.focus();
    }}>
      <div className="launcher-header">
        <div className="flex items-center gap-2.5"><LayoutGrid size={19} className="text-accent" /><h2>Applications</h2></div>
        <label className="launcher-search">
          <Search size={17} className="text-muted" />
          <input ref={searchInput} type="search" aria-label="Search applications" placeholder="Search apps" value={search} onChange={(event) => {
            setSearch(event.target.value);
            setSelected(event.target.value ? 0 : -1);
          }} onKeyDown={(event) => {
            if (event.key === 'Enter') {
              const app = filtered[Math.max(0, selected)];
              if (app) launch(app);
            }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            if (!filtered.length) return;
            const next = Math.max(0, Math.min(filtered.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)));
            setSelected(next);
            results.current?.children[next]?.scrollIntoView({ block: 'nearest' });
          }} />
          <kbd>Esc</kbd>
        </label>
      </div>
      <div className="launcher-main">
        <nav className="launcher-categories" aria-label="Application categories">
          {categories.map((item) => <button key={item} aria-pressed={!query && category === item} onClick={() => {
            setCategory(item);
            setSearch('');
            setSelected(-1);
          }}>{item}</button>)}
        </nav>
        <div className="launcher-content">
          {!query && category === 'All apps' && recent.length > 0 && (
            <section className="launcher-recent">
              <h3>Recent</h3>
              <div>{recent.map((app) => <button key={app.id} onClick={() => launch(app)} title={app.name}><AppIcon name={app.icon} size={15} tile /><span>{app.name}</span></button>)}</div>
            </section>
          )}
          <h3>{query ? 'Search results' : category}</h3>
          {!filtered.length && <p className="launcher-empty">No apps match “{search.trim()}”</p>}
          <div className="launcher-grid" ref={results}>
            {filtered.map((app, index) => (
              <button key={app.id} title={app.description} data-selected={selected === index} onClick={() => launch(app)}>
                <AppIcon name={app.icon} size={25} tile />
                <span>{app.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <footer className="launcher-footer">
        <div className="launcher-user"><UserRound size={18} /><span>{user.displayName}</span></div>
        <div className="flex gap-1">
          <button className="dock-system-button" title="Lock Session" aria-label="Lock Session" onClick={() => { setIsLocked(true); setAppLauncherOpen(false); }}><Lock size={17} /></button>
          <button className="dock-system-button" title="Restart AetherOS" aria-label="Restart AetherOS" onClick={() => void power(true)}><RotateCcw size={17} /></button>
          <button className="dock-system-button" title="Shut Down" aria-label="Shut Down" onClick={() => void power(false)}><Power size={17} /></button>
        </div>
      </footer>
    </section>
  );
}
