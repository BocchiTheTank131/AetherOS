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
          <span className="flex items-center gap-1 text-red-400 font-semibold">
            <AlertCircle className="w-3 h-3" /> ERROR
          </span>
        );
      case 'warn':
        return (
          <span className="flex items-center gap-1 text-amber-400 font-semibold">
            <AlertTriangle className="w-3 h-3" /> WARN
          </span>
        );
      case 'info':
        return (
          <span className="flex items-center gap-1 text-cyan-400 font-semibold">
            <Info className="w-3 h-3" /> INFO
          </span>
        );
      default:
        return <span className="text-gray-400">DEBUG</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-gray-200 font-mono text-xs select-text overflow-hidden">
      {/* Top Controls Toolbar */}
      <div className="flex items-center justify-between p-2 bg-[#161b22] border-b border-[#30363d] select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-white">System Journal Logs</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-white outline-none"
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-gray-400" />
            <input
              type="text"
              placeholder="Filter logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#0d1117] border border-gray-700 rounded pl-7 pr-2 py-1 text-white outline-none w-36"
            />
          </div>

          <button
            onClick={handleExport}
            className="p-1.5 hover:bg-gray-800 text-gray-300 hover:text-white rounded"
            title="Export Logs"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              systemLogger.clear();
              setLogs([]);
            }}
            className="p-1.5 hover:bg-gray-800 text-gray-300 hover:text-red-400 rounded"
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
            className="grid grid-cols-12 gap-2 py-0.5 leading-relaxed hover:bg-gray-800/40 px-1 rounded"
          >
            <span className="col-span-2 text-gray-500 truncate">
              {new Date(entry.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <span className="col-span-2">{getLevelBadge(entry.level)}</span>
            <span className="col-span-2 text-purple-400 font-semibold truncate">
              [{entry.subsystem}]
            </span>
            <span className="col-span-6 text-gray-200 break-all">{entry.message}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-t border-[#30363d] text-[11px] text-gray-400 select-none">
        <span>{filteredLogs.length} entries shown</span>
        <span>Ring Buffer: max 1000 lines</span>
      </div>
    </div>
  );
};
