// AetherOS - Global Command Palette / Quick Runner (Alt+Space)
import React, { useState, useEffect, useRef } from 'react';
import { useSystem } from '../../core/context';
import { appRegistry } from '../../apps/appRegistry';
import { getAppForFile, getMimeType } from '../../vfs/mime';
import { searchIndexer } from '../../vfs/searchIndexer';
import { commandRegistry } from '../../shell/registry';
import { Search, Terminal, FileText, AppWindow, ArrowRight } from 'lucide-react';

export const CommandPalette: React.FC = () => {
  const { quickRunnerOpen } = useSystem();
  return quickRunnerOpen ? <CommandPaletteContent /> : null;
};

function CommandPaletteContent() {
  const { setQuickRunnerOpen, openWindow } = useSystem();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.children[selectedIndex]?.scrollIntoView({ block: 'nearest' }); }, [selectedIndex]);

  // Search Results aggregation
  const apps = appRegistry
    .getAll()
    .filter(
      (a) =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.description.toLowerCase().includes(query.toLowerCase())
    )
    .map((a) => ({
      type: 'app' as const,
      id: a.id,
      title: a.name,
      subtitle: a.description,
      action: () => openWindow(a.id),
    }));

  const files = searchIndexer.searchFiles(query, 5).map((f) => ({
    type: 'file' as const,
    id: f.path,
    title: f.name,
    subtitle: f.path,
    action: () => f.type === 'dir'
      ? openWindow('file-manager', { initialPath: f.path })
      : openWindow(getAppForFile(f.name, f.mimeType ?? getMimeType(f.name)), { filePath: f.path }),
  }));

  const cmds = commandRegistry
    .getAll()
    .filter((c) => c.name.toLowerCase().startsWith(query.toLowerCase()))
    .slice(0, 5)
    .map((c) => ({
      type: 'command' as const,
      id: c.name,
      title: c.name,
      subtitle: c.description,
      action: () => openWindow('terminal', { initialCommand: c.name }),
    }));

  const allResults = [...apps, ...files, ...cmds];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setQuickRunnerOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (allResults.length > 0 ? (prev + 1) % allResults.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        allResults.length > 0 ? (prev - 1 + allResults.length) % allResults.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allResults[selectedIndex]) {
        allResults[selectedIndex].action();
        setQuickRunnerOpen(false);
      }
    }
  };

  return (
    <div className="command-scrim" onClick={() => setQuickRunnerOpen(false)}>
      <div className="command-panel ui-panel ui-material" role="dialog" aria-label="Command palette" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
        if (event.key === 'Escape') setQuickRunnerOpen(false);
      }}>
        <header>
          <Search size={21} className="text-accent" />
          <input ref={inputRef} type="search" value={query} aria-label="Search commands, files, and apps" placeholder="Search commands, files, and apps" onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }} onKeyDown={handleKeyDown} />
          <kbd>Esc</kbd>
        </header>
        <div className="command-list" ref={list}>
          {allResults.length === 0 && <p className="p-5 text-muted">No matching apps, files, or commands</p>}
          {allResults.map((item, index) => {
            const Icon = item.type === 'app' ? AppWindow : item.type === 'file' ? FileText : Terminal;
            return (
              <button className="command-result" key={`${item.type}-${item.id}`} data-selected={selectedIndex === index} onClick={() => {
                item.action();
                setQuickRunnerOpen(false);
              }}>
                <Icon size={19} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{item.title}</span>
                  <span className="block truncate text-xs text-muted">{item.subtitle}</span>
                </span>
                {selectedIndex === index && <ArrowRight size={15} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
