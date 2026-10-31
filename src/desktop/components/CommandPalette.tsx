// AetherOS - Global Command Palette / Quick Runner (Alt+Space)
import React, { useState, useEffect, useRef } from 'react';
import { useSystem } from '../../core/context';
import { appRegistry } from '../../apps/appRegistry';
import { searchIndexer } from '../../vfs/searchIndexer';
import { commandRegistry } from '../../shell/registry';
import { Search, Terminal, FileText, AppWindow, ArrowRight } from 'lucide-react';

export const CommandPalette: React.FC = () => {
  const { quickRunnerOpen, setQuickRunnerOpen, openWindow, theme } = useSystem();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (quickRunnerOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [quickRunnerOpen]);

  if (!quickRunnerOpen) return null;

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
    action: () => openWindow('file-manager', { initialPath: f.path }),
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
    <div
      onClick={() => setQuickRunnerOpen(false)}
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex justify-center pt-24 px-4 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-xl rounded-2xl border border-gray-700/80 shadow-2xl overflow-hidden flex flex-col ${
          theme.blur ? 'glass-panel' : 'bg-[#161c28]'
        } max-h-[460px]`}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 p-3.5 border-b border-gray-700/60 bg-[#1e2536]/80">
          <Search className="w-5 h-5 text-cyan-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, file, or application name..."
            className="w-full bg-transparent text-white text-sm outline-none placeholder-gray-400 font-sans"
          />
          <kbd className="px-2 py-0.5 rounded bg-gray-800 text-[10px] text-gray-400 border border-gray-700 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {allResults.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-xs">
              No matching applications, files, or commands
            </div>
          ) : (
            allResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => {
                    item.action();
                    setQuickRunnerOpen(false);
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200'
                      : 'hover:bg-gray-800/60 text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 rounded-lg bg-gray-800 text-cyan-400">
                      {item.type === 'app' ? (
                        <AppWindow className="w-4 h-4" />
                      ) : item.type === 'file' ? (
                        <FileText className="w-4 h-4" />
                      ) : (
                        <Terminal className="w-4 h-4" />
                      )}
                    </div>
                    <div className="truncate">
                      <div className="font-semibold text-xs text-white">{item.title}</div>
                      <div className="text-[11px] text-gray-400 truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <ArrowRight
                    className={`w-4 h-4 transition-transform ${
                      isSelected ? 'text-cyan-400 translate-x-0.5' : 'text-gray-600'
                    }`}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
