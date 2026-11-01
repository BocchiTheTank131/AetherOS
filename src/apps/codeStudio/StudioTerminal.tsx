// AetherOS - Code Studio Integrated Terminal
import React, { useState, useRef, useEffect } from 'react';
import { shellExecutor } from '../../shell/executor';
import { virtualKernel } from '../../core/kernel';
import { Terminal as TerminalIcon, Trash2 } from 'lucide-react';

export interface StudioTerminalProps {
  cwd: string;
  onCwdChange?: (newCwd: string) => void;
}

export const StudioTerminal: React.FC<StudioTerminalProps> = ({ cwd, onCwdChange: _onCwdChange }) => {
  const [history, setHistory] = useState<string[]>([
    'AetherOS Developer Terminal (aesh v1.4.0)',
    `Project workspace: ${cwd}`,
    'Type "help" for a list of commands, "python", "tsc", "git", or "aetherpkg".',
    '',
  ]);
  const [currentInput, setCurrentInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [activePid, setActivePid] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    // History Navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(nextIdx);
      setCurrentInput(commandHistory[commandHistory.length - 1 - nextIdx] || '');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCurrentInput(commandHistory[commandHistory.length - 1 - nextIdx] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCurrentInput('');
      }
      return;
    }

    // Ctrl+C cancellation
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      if (activePid) {
        virtualKernel.kill(activePid, 'SIGINT');
        setHistory((prev) => [...prev, '^C']);
      }
      setCurrentInput('');
      return;
    }

    // Execute command
    if (e.key === 'Enter') {
      const cmd = currentInput.trim();
      setCurrentInput('');
      setHistoryIndex(-1);

      const promptLine = `aether@aetheros:${cwd.replace('/home/aether', '~')}$ ${cmd}`;
      setHistory((prev) => [...prev, promptLine]);

      if (!cmd) return;

      setCommandHistory((prev) => [...prev, cmd]);

      if (cmd === 'clear') {
        setHistory([]);
        return;
      }

      setIsRunning(true);
      const proc = virtualKernel.spawn({
        name: cmd.split(' ')[0],
        command: cmd,
        user: 'aether',
      });
      setActivePid(proc.pid);

      try {
        const res = await shellExecutor.execute(cmd, {
          cwd,
          env: { PATH: '/bin:/usr/bin', HOME: '/home/aether' },
          user: 'aether',
          hostname: 'aether-box',
          aliases: {},
          history: [],
          exitCode: 0,
        });

        virtualKernel.exit(proc.pid, res.exitCode);

        const linesToAdd: string[] = [];
        if (res.stdout) {
          linesToAdd.push(...res.stdout.split('\n').filter((l, idx, arr) => idx < arr.length - 1 || l));
        }
        if (res.stderr) {
          linesToAdd.push(...res.stderr.split('\n').filter((l, idx, arr) => idx < arr.length - 1 || l));
        }

        setHistory((prev) => [...prev, ...linesToAdd]);
      } catch (err) {
        virtualKernel.exit(proc.pid, 1);
        setHistory((prev) => [...prev, `shell error: ${(err as Error).message}`]);
      } finally {
        setIsRunning(false);
        setActivePid(null);
      }
    }
  };

  return (
    <div
      className="flex flex-col h-full w-full bg-[#0d1017] text-gray-200 font-mono text-xs select-text overflow-hidden cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex items-center justify-between px-3 py-1 bg-[#161a26] border-b border-gray-800 text-[10px] text-gray-400 select-none">
        <div className="flex items-center gap-1.5">
          <TerminalIcon className="w-3 h-3 text-cyan-400" />
          <span>Integrated Project Terminal</span>
          {isRunning && (
            <span className="text-amber-400 font-normal">
              (Running PID {activePid})
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setHistory([]);
          }}
          className="flex items-center gap-1 hover:text-white transition-colors"
          title="Clear Terminal"
        >
          <Trash2 className="w-3 h-3" />
          <span>Clear</span>
        </button>
      </div>

      <div className="flex-1 p-2 overflow-y-auto space-y-0.5">
        {history.map((line, idx) => (
          <div key={idx} className="whitespace-pre-wrap break-all leading-5">
            {line}
          </div>
        ))}

        {/* Active prompt row */}
        <div className="flex items-center gap-1 leading-5">
          <span className="text-cyan-400 select-none">
            aether@aetheros:{cwd.replace('/home/aether', '~')}$
          </span>
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            spellCheck={false}
            autoFocus
            className="flex-1 bg-transparent text-white outline-none caret-cyan-400 border-none p-0 text-xs"
          />
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
