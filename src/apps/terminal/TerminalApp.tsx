// AetherOS - Terminal Application (aesh Shell Front-end)
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AppProps } from '../types';
import { shellExecutor } from '../../shell/executor';
import { createDefaultShellContext } from '../../shell/environment';
import { commandRegistry } from '../../shell/registry';
import { vfs } from '../../vfs/vfs';
import { virtualKernel } from '../../core/kernel';
import { AETHER_VERSION } from '../../core/version';
import { Plus, X } from 'lucide-react';

interface TerminalTab {
  id: string;
  title: string;
  history: Array<{ type: 'input' | 'output' | 'error'; text: string }>;
  context: ReturnType<typeof createDefaultShellContext>;
  historyIdx: number;
}

export const TerminalApp: React.FC<AppProps> = ({ setTitle, initialProps }) => {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [
    {
      id: 'tab-1',
      title: 'aesh',
      history: [
        {
          type: 'output',
          text: `\x1b[1;36mAetherOS v${AETHER_VERSION.version} (${AETHER_VERSION.codename}) [${AETHER_VERSION.architecture}]\x1b[0m\nWelcome to AetherOS. The ${AETHER_VERSION.shell} is ready.\nType \x1b[1;32mhelp\x1b[0m for commands, \x1b[1;33mfastfetch\x1b[0m for system overview, or \x1b[1;35mjs\x1b[0m for script execution.\n`,
        },
      ],
      context: (() => {
        const context = createDefaultShellContext();
        try {
          context.history = vfs.readFile('/home/aether/.aesh_history').split('\n').map((line) => line.trim()).filter(Boolean);
        } catch {}
        return context;
      })(),
      historyIdx: -1,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [inputVal, setInputVal] = useState(
    typeof initialProps?.initialCommand === 'string' ? initialProps.initialCommand : ''
  );
  const running = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const commands = running.current;
    return () => { for (const controller of commands.values()) controller.abort(143); };
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialProps?.initialCommand && typeof initialProps.initialCommand === 'string') {
      inputRef.current?.focus();
    }
  }, [initialProps?.initialCommand]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab?.history]);

  useEffect(() => {
    if (setTitle && activeTab) {
      const shortCwd = activeTab.context.cwd.replace(/^\/home\/aether/, '~');
      setTitle(`aether@aetheros: ${shortCwd}`);
    }
  }, [activeTab?.context.cwd, activeTab, setTitle]);

  const handleExecute = useCallback(async () => {
    if (!activeTab || running.current.has(activeTabId)) return;
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

    const targetTabId = activeTabId;
    const controller = new AbortController();
    running.current.set(targetTabId, controller);
    const context = {
      ...activeTab.context,
      aliases: { ...activeTab.context.aliases },
      env: { ...activeTab.context.env },
      history: [...activeTab.context.history],
      functions: { ...activeTab.context.functions },
      jobs: new Map(activeTab.context.jobs),
      signal: controller.signal,
    };
    try {
      const res = await shellExecutor.execute(cmd, context);

      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== targetTabId) return t;
          const newHist = [...t.history];
          if (res.stdout) {
            newHist.push({ type: 'output', text: res.stdout.slice(-256 * 1024) });
          }
          if (res.stderr) {
            newHist.push({ type: 'error', text: res.stderr.slice(-256 * 1024) });
          }
          return {
            ...t,
            history: newHist.slice(-350),
            context: { ...context, signal: undefined },
          };
        })
      );
    } catch (err) {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== targetTabId) return t;
          return {
            ...t,
            history: [...t.history, { type: 'error', text: `aesh: ${(err as Error).message}\n` }],
          };
        })
      );
    }
    finally {
      running.current.delete(targetTabId);
    }
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
      running.current.get(activeTabId)?.abort(130);
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
    running.current.get(id)?.abort(143);
    e.stopPropagation();
    const closing = tabs.find((tab) => tab.id === id);
    for (const job of closing?.context.jobs?.values() ?? []) virtualKernel.kill(job.pid, 'SIGTERM');
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id) {
      setActiveTabId(remaining[0].id);
    }
  };

  // Convert ANSI escape sequences to styled spans
  const renderAnsi = (text: string) => {
    /* eslint-disable no-control-regex */
    // Strip non-SGR ANSI escape sequences (cursor movement, clear line, private modes, OSC, etc.)
    const cleanedText = text
      .replace(/\x1b\[[0-9;]*[A-HJKSTfhilnsu]/g, '')
      .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
      .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '');

    const parts = cleanedText.split(/(\x1b\[[0-9;]*m)/g);
    /* eslint-enable no-control-regex */
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
          currentColor = 'var(--ui-danger)'; // red
        } else if (part.includes('32m')) {
          currentColor = 'var(--ui-positive)'; // green
        } else if (part.includes('33m')) {
          currentColor = 'var(--ui-caution)'; // yellow
        } else if (part.includes('34m')) {
          currentColor = 'var(--ui-accent)'; // blue
        } else if (part.includes('35m')) {
          currentColor = 'var(--ui-iris)'; // purple
        } else if (part.includes('36m')) {
          currentColor = 'var(--ui-aqua)'; // cyan
        } else if (part.includes('30m')) {
          currentColor = 'var(--ui-muted)'; // gray
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
      className="flex flex-col h-full bg-canvas text-ink font-mono text-sm overflow-hidden select-text"
    >
      {/* Tab Bar */}
      <div className="app-tabbar" role="group" aria-label="Terminal tabs">
        {tabs.map((tab) => (
          <div key={tab.id} className="app-tab" data-active={tab.id === activeTabId}>
            <button type="button" aria-pressed={tab.id === activeTabId} onClick={() => setActiveTabId(tab.id)}>
              <span>{tab.title}</span>
            </button>
            {tabs.length > 1 && (
              <button
                aria-label={`Close ${tab.title}`}
                onClick={(e) => closeTab(tab.id, e)}
                className="hover:bg-danger/20 hover:text-danger rounded p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addTab}
          className="app-tab-new text-muted"
          title="New Tab"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Terminal Output */}
      <div className="terminal-output">
        {activeTab?.history.map((item, idx) => (
          <div
            key={idx}
            data-line={item.type}
            className={`whitespace-pre-wrap leading-relaxed ${
              item.type === 'input'
                ? 'text-accent font-semibold'
                : item.type === 'error'
                ? 'text-danger'
                : 'text-ink'
            }`}
          >
            {renderAnsi(item.text)}
          </div>
        ))}

        {/* Active Command Line */}
        <div className="terminal-prompt">
          <span className="text-accent font-semibold whitespace-nowrap">
            aether@aetheros:<span className="text-accent">{shortCwd}</span>$
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Terminal command"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent text-ink outline-none border-none p-0 font-mono text-sm"
          />
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
