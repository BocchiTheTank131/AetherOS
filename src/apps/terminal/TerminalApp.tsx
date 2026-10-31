// AetherOS - Terminal Application (aesh Shell Front-end)
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AppProps } from '../types';
import { shellExecutor } from '../../shell/executor';
import { createDefaultShellContext } from '../../shell/environment';
import { commandRegistry } from '../../shell/registry';
import { vfs } from '../../vfs/vfs';
import { Plus, X } from 'lucide-react';

interface TerminalTab {
  id: string;
  title: string;
  history: Array<{ type: 'input' | 'output' | 'error'; text: string }>;
  context: ReturnType<typeof createDefaultShellContext>;
  historyIdx: number;
}

export const TerminalApp: React.FC<AppProps> = ({ setTitle }) => {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    {
      id: 'tab-1',
      title: 'aesh',
      history: [
        {
          type: 'output',
          text: '\x1b[1;36mAetherOS 1.0 (x86_64-pc-aetheros)\x1b[0m\nWelcome to AetherOS. The aesh shell is ready.\nType \x1b[1;32mhelp\x1b[0m for commands or \x1b[1;33mfastfetch\x1b[0m for system overview.\n',
        },
      ],
      context: createDefaultShellContext(),
      historyIdx: -1,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [inputVal, setInputVal] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab?.history]);

  // Load persistent history on mount
  useEffect(() => {
    try {
      if (vfs.exists('/home/aether/.aesh_history')) {
        const raw = vfs.readFile('/home/aether/.aesh_history');
        const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          setTabs((prev) =>
            prev.map((t) => ({
              ...t,
              context: {
                ...t.context,
                history: [...new Set([...t.context.history, ...lines])],
              },
            }))
          );
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (setTitle && activeTab) {
      const shortCwd = activeTab.context.cwd.replace(/^\/home\/aether/, '~');
      setTitle(`aether@aetheros: ${shortCwd}`);
    }
  }, [activeTab?.context.cwd, activeTab, setTitle]);

  const handleExecute = useCallback(async () => {
    if (!activeTab) return;
    const cmd = inputVal;
    setInputVal('');

    const shortCwd = activeTab.context.cwd.replace(/^\/home\/aether/, '~');
    const promptStr = `aether@aetheros:${shortCwd}$ ${cmd}`;

    // Append input line
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              history: [...t.history, { type: 'input', text: promptStr }],
              historyIdx: -1,
            }
          : t
      )
    );

    if (!cmd.trim()) return;

    // Append to persistent history file
    try {
      vfs.appendFile('/home/aether/.aesh_history', cmd.trim() + '\n');
    } catch {
      // Ignore
    }

    // Handle clear specially for instant visual feel
    if (cmd.trim() === 'clear') {
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, history: [] } : t))
      );
      return;
    }

    const res = await shellExecutor.execute(cmd, activeTab.context);

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeTabId) return t;
        const newHist = [...t.history];
        if (res.stdout) {
          newHist.push({ type: 'output', text: res.stdout });
        }
        if (res.stderr) {
          newHist.push({ type: 'error', text: res.stderr });
        }
        return {
          ...t,
          history: newHist,
        };
      })
    );
  }, [activeTab, activeTabId, inputVal]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeTab) return;

    // Enter
    if (e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
      return;
    }

    // Ctrl+L (Clear Screen)
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, history: [] } : t))
      );
      return;
    }

    // Ctrl+C (Interrupt)
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      const shortCwd = activeTab.context.cwd.replace(/^\/home\/aether/, '~');
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                history: [
                  ...t.history,
                  { type: 'input', text: `aether@aetheros:${shortCwd}$ ${inputVal}^C` },
                ],
              }
            : t
        )
      );
      setInputVal('');
      return;
    }

    // Up Arrow (History Backwards)
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const hist = activeTab.context.history;
      if (hist.length === 0) return;

      const nextIdx =
        activeTab.historyIdx === -1
          ? hist.length - 1
          : Math.max(0, activeTab.historyIdx - 1);

      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, historyIdx: nextIdx } : t))
      );
      setInputVal(hist[nextIdx] || '');
      return;
    }

    // Down Arrow (History Forwards)
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const hist = activeTab.context.history;
      if (activeTab.historyIdx === -1) return;

      const nextIdx = activeTab.historyIdx + 1;
      if (nextIdx >= hist.length) {
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, historyIdx: -1 } : t))
        );
        setInputVal('');
      } else {
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, historyIdx: nextIdx } : t))
        );
        setInputVal(hist[nextIdx] || '');
      }
      return;
    }

    // Tab (Autocompletion)
    if (e.key === 'Tab') {
      e.preventDefault();
      const parts = inputVal.split(' ');
      const lastWord = parts[parts.length - 1];

      if (parts.length === 1 && !lastWord.includes('/') && !lastWord.startsWith('~')) {
        // Complete command name
        const cmds = commandRegistry.getAll().map((c) => c.name);
        const matches = cmds.filter((c) => c.startsWith(lastWord));
        if (matches.length === 1) {
          setInputVal(matches[0] + ' ');
        } else if (matches.length > 1) {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === activeTabId
                ? {
                    ...t,
                    history: [
                      ...t.history,
                      { type: 'output', text: matches.join('  ') + '\n' },
                    ],
                  }
                : t
            )
          );
        }
      } else {
        // Complete file/directory path (supports relative, absolute, and ~)
        try {
          let searchDir = activeTab.context.cwd;
          let prefix = lastWord;
          let leadingPath = '';

          // Expand ~
          let expandedWord = lastWord;
          if (expandedWord.startsWith('~')) {
            expandedWord = expandedWord.replace(/^~/, '/home/aether');
          }

          if (expandedWord.includes('/')) {
            const lastSlash = expandedWord.lastIndexOf('/');
            leadingPath = lastWord.slice(0, lastWord.lastIndexOf('/') + 1);
            const dirPart = expandedWord.slice(0, lastSlash) || '/';
            prefix = expandedWord.slice(lastSlash + 1);
            searchDir = vfs.resolve(activeTab.context.cwd, dirPart);
          }

          if (vfs.exists(searchDir) && vfs.stat(searchDir).isDirectory()) {
            const entries = vfs.readdir(searchDir);
            const matches = entries
              .filter((entry) => entry.name.startsWith(prefix))
              .map((entry) => (entry.type === 'dir' ? entry.name + '/' : entry.name));

            if (matches.length === 1) {
              parts[parts.length - 1] = leadingPath + matches[0];
              setInputVal(parts.join(' '));
            } else if (matches.length > 1) {
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === activeTabId
                    ? {
                        ...t,
                        history: [
                          ...t.history,
                          { type: 'output', text: matches.join('  ') + '\n' },
                        ],
                      }
                    : t
                )
              );
            }
          }
        } catch {
          // Ignore autocomplete errors
        }
      }
    }
  };

  const addTab = () => {
    const newId = `tab-${Date.now()}`;
    const ctx = createDefaultShellContext();
    try {
      if (vfs.exists('/home/aether/.aesh_history')) {
        const raw = vfs.readFile('/home/aether/.aesh_history');
        const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          ctx.history = lines;
        }
      }
    } catch {
      // Ignore
    }

    const newTab: TerminalTab = {
      id: newId,
      title: 'aesh',
      history: [
        {
          type: 'output',
          text: '\x1b[1;36mAetherOS aesh session started\x1b[0m\n',
        },
      ],
      context: ctx,
      historyIdx: -1,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[0].id);
    }
  };

  // Convert ANSI escape sequences to styled spans
  const renderAnsi = (text: string) => {
    // eslint-disable-next-line no-control-regex
    const parts = text.split(/(\x1b\[[0-9;]*m)/g);
    let currentColor = '';
    let isBold = false;

    return parts.map((part, idx) => {
      if (part.startsWith('\x1b[')) {
        if (part === '\x1b[0m') {
          currentColor = '';
          isBold = false;
        } else if (part === '\x1b[1m') {
          isBold = true;
        } else if (part.includes('31m')) {
          currentColor = '#f87171'; // red
        } else if (part.includes('32m')) {
          currentColor = '#4ade80'; // green
        } else if (part.includes('33m')) {
          currentColor = '#facc15'; // yellow
        } else if (part.includes('34m')) {
          currentColor = '#60a5fa'; // blue
        } else if (part.includes('35m')) {
          currentColor = '#c084fc'; // purple
        } else if (part.includes('36m')) {
          currentColor = '#22d3ee'; // cyan
        } else if (part.includes('30m')) {
          currentColor = '#94a3b8'; // gray
        }
        return null;
      }

      return (
        <span
          key={idx}
          style={{
            color: currentColor || undefined,
            fontWeight: isBold ? 'bold' : 'normal',
          }}
        >
          {part}
        </span>
      );
    });
  };

  const shortCwd = activeTab?.context.cwd.replace(/^\/home\/aether/, '~') || '~';

  return (
    <div
      className="flex flex-col h-full bg-[#0d1117] text-[#e6edf3] font-mono text-sm overflow-hidden select-text"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Tab Bar */}
      <div className="flex items-center bg-[#161b22] border-b border-[#30363d] px-2 select-none overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-t cursor-pointer border-t-2 transition-colors ${
              tab.id === activeTabId
                ? 'bg-[#0d1117] text-white border-cyan-400 font-medium'
                : 'text-gray-400 border-transparent hover:bg-[#1f242c]'
            }`}
          >
            <span>{tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => closeTab(tab.id, e)}
                className="hover:bg-red-500/20 hover:text-red-400 rounded p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addTab}
          className="p-1 text-gray-400 hover:text-white hover:bg-[#1f242c] rounded ml-1"
          title="New Tab"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Terminal Output */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {activeTab?.history.map((item, idx) => (
          <div
            key={idx}
            className={`whitespace-pre-wrap leading-relaxed ${
              item.type === 'input'
                ? 'text-cyan-300 font-semibold'
                : item.type === 'error'
                ? 'text-red-400'
                : 'text-[#e6edf3]'
            }`}
          >
            {renderAnsi(item.text)}
          </div>
        ))}

        {/* Active Command Line */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-cyan-400 font-semibold whitespace-nowrap">
            aether@aetheros:<span className="text-blue-400">{shortCwd}</span>$
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent text-white outline-none border-none p-0 font-mono text-sm"
          />
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
