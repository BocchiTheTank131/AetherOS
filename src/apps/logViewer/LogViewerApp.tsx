// AetherOS - System Log Viewer (journalctl / dmesg GUI)
import React, { useState, useEffect } from 'react';
import type { AppProps } from '../types';
import { systemLogger } from '../../core/logger';
import type { SystemLogEntry } from '../../core/types';
import { Terminal, Search, Trash2, Download, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export const LogViewerApp: React.FC<AppProps> = () => {
  const [logs, setLogs] = useState<SystemLogEntry[]>(() => systemLogger.getLogs());
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsub = systemLogger.subscribe((entry) => {
      setLogs((prev) => [...prev.slice(-999), entry]);
    });
    return () => unsub();
  }, []);

  const filteredLogs = logs.filter((l) => {
    if (levelFilter !== 'all' && l.level !== levelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.message.toLowerCase().includes(q) || l.subsystem.toLowerCase().includes(q);
    }
    return true;
  });

  const handleExport = () => {
    const text = systemLogger.formatJournal().join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aetheros-journal-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getLevelBadge = (level: SystemLogEntry['level']) => {
    switch (level) {
      case 'error':
        return (
          <span className="flex items-center gap-1 text-danger font-semibold">
            <AlertCircle className="w-3 h-3" /> ERROR
          </span>
        );
      case 'warn':
        return (
          <span className="flex items-center gap-1 text-caution font-semibold">
            <AlertTriangle className="w-3 h-3" /> WARN
          </span>
        );
      case 'info':
        return (
          <span className="flex items-center gap-1 text-accent font-semibold">
            <Info className="w-3 h-3" /> INFO
          </span>
        );
      default:
        return <span className="text-muted">DEBUG</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas text-ink font-mono text-xs select-text overflow-hidden">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between p-2 bg-side border-b border-line select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-accent" />
          <span className="font-semibold text-ink">System Journal Logs</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-canvas border border-line rounded px-2 py-1 text-ink outline-none"
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-muted" />
            <input
              type="text"
              placeholder="Filter logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-canvas border border-line rounded pl-7 pr-2 py-1 text-ink outline-none w-36"
            />
          </div>

          <button
            onClick={handleExport}
            className="p-1.5 hover:bg-hover text-secondary hover:text-ink rounded"
            title="Export Logs"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              systemLogger.clear();
              setLogs([]);
            }}
            className="p-1.5 hover:bg-hover text-secondary hover:text-danger rounded"
            title="Clear Buffer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Log Entries */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredLogs.map((entry) => (
          <div
            key={entry.id}
            className="grid grid-cols-12 gap-2 py-0.5 leading-relaxed hover:bg-hover px-1 rounded"
          >
            <span className="col-span-2 text-muted truncate">
              {new Date(entry.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <span className="col-span-2">{getLevelBadge(entry.level)}</span>
            <span className="col-span-2 text-iris font-semibold truncate">
              [{entry.subsystem}]
            </span>
            <span className="col-span-6 text-ink break-all">{entry.message}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 bg-side border-t border-line text-[11px] text-muted select-none">
        <span>{filteredLogs.length} entries shown</span>
        <span>Ring Buffer: max 1000 lines</span>
      </div>
    </div>
  );
};
