// AetherOS - 2048 Puzzle Game
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AppProps } from '../types';
import { RotateCcw } from 'lucide-react';

const SIZE = 4;

function spawnTile(b: number[][]): number[][] {
  const empty: Array<[number, number]> = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] === 0) empty.push([r, c]);
    }
  }
  if (empty.length === 0) return b;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const next = b.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function newBoard(): number[][] {
  return spawnTile(spawnTile(Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0))));
}

export const Game2048App: React.FC<AppProps> = ({ isFocused }) => {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [board, setBoard] = useState(newBoard);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const initGame = () => {
    setBoard(newBoard());
    setScore(0);
    setGameOver(false);
  };

  const checkGameOver = (b: number[][]): boolean => {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (b[r][c] === 0) return false;
        if (c < SIZE - 1 && b[r][c] === b[r][c + 1]) return false;
        if (r < SIZE - 1 && b[r][c] === b[r + 1][c]) return false;
      }
    }
    return true;
  };

  const slide = (row: number[]): { newRow: number[]; gained: number } => {
    let arr = row.filter((x) => x !== 0);
    let gained = 0;
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] === arr[i + 1]) {
        arr[i] *= 2;
        gained += arr[i];
        arr.splice(i + 1, 1);
      }
    }
    while (arr.length < SIZE) arr.push(0);
    return { newRow: arr, gained };
  };

  const moveLeft = useCallback(() => {
    if (gameOver) return;
    let changed = false;
    let gainedTotal = 0;
    const next = board.map((row) => {
      const { newRow, gained } = slide(row);
      gainedTotal += gained;
      if (newRow.some((val, idx) => val !== row[idx])) changed = true;
      return newRow;
    });

    if (changed) {
      const spawned = spawnTile(next);
      setBoard(spawned);
      if (checkGameOver(spawned)) {
        setGameOver(true);
      }
      setScore((s) => {
        const nextScore = s + gainedTotal;
        setBestScore((b) => Math.max(b, nextScore));
        return nextScore;
      });
    }
  }, [board, gameOver]);

  const moveRight = useCallback(() => {
    if (gameOver) return;
    let changed = false;
    let gainedTotal = 0;
    const next = board.map((row) => {
      const reversed = [...row].reverse();
      const { newRow, gained } = slide(reversed);
      gainedTotal += gained;
      const res = newRow.reverse();
      if (res.some((val, idx) => val !== row[idx])) changed = true;
      return res;
    });

    if (changed) {
      const spawned = spawnTile(next);
      setBoard(spawned);
      if (checkGameOver(spawned)) {
        setGameOver(true);
      }
      setScore((s) => {
        const nextScore = s + gainedTotal;
        setBestScore((b) => Math.max(b, nextScore));
        return nextScore;
      });
    }
  }, [board, gameOver]);

  const moveUp = useCallback(() => {
    if (gameOver) return;
    let changed = false;
    let gainedTotal = 0;
    const next = Array(SIZE)
      .fill(0)
      .map(() => Array(SIZE).fill(0));

    for (let c = 0; c < SIZE; c++) {
      const col = [board[0][c], board[1][c], board[2][c], board[3][c]];
      const { newRow, gained } = slide(col);
      gainedTotal += gained;
      for (let r = 0; r < SIZE; r++) {
        next[r][c] = newRow[r];
        if (next[r][c] !== board[r][c]) changed = true;
      }
    }

    if (changed) {
      const spawned = spawnTile(next);
      setBoard(spawned);
      if (checkGameOver(spawned)) {
        setGameOver(true);
      }
      setScore((s) => {
        const nextScore = s + gainedTotal;
        setBestScore((b) => Math.max(b, nextScore));
        return nextScore;
      });
    }
  }, [board, gameOver]);

  const moveDown = useCallback(() => {
    if (gameOver) return;
    let changed = false;
    let gainedTotal = 0;
    const next = Array(SIZE)
      .fill(0)
      .map(() => Array(SIZE).fill(0));

    for (let c = 0; c < SIZE; c++) {
      const col = [board[3][c], board[2][c], board[1][c], board[0][c]];
      const { newRow, gained } = slide(col);
      gainedTotal += gained;
      const res = newRow.reverse();
      for (let r = 0; r < SIZE; r++) {
        next[r][c] = res[r];
        if (next[r][c] !== board[r][c]) changed = true;
      }
    }

    if (changed) {
      const spawned = spawnTile(next);
      setBoard(spawned);
      if (checkGameOver(spawned)) {
        setGameOver(true);
      }
      setScore((s) => {
        const nextScore = s + gainedTotal;
        setBestScore((b) => Math.max(b, nextScore));
        return nextScore;
      });
    }
  }, [board, gameOver]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isFocused || gameOver) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      // Do not intercept OS modifier shortcuts (e.g. Alt+Left for window snapping, Ctrl+A for select all)
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key === 'ArrowLeft' || e.key === 'a') {
        e.preventDefault();
        moveLeft();
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        e.preventDefault();
        moveRight();
      } else if (e.key === 'ArrowUp' || e.key === 'w') {
        e.preventDefault();
        moveUp();
      } else if (e.key === 'ArrowDown' || e.key === 's') {
        e.preventDefault();
        moveDown();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFocused, gameOver, moveLeft, moveRight, moveUp, moveDown]);

  const getTileColor = (val: number): string => {
    switch (val) {
      case 2:
        return 'bg-control text-ink';
      case 4:
        return 'bg-hover text-ink';
      case 8:
        return 'bg-[#a15624] text-on-action';
      case 16:
        return 'bg-[#9b4433] text-on-action';
      case 32:
        return 'bg-[#9a3853] text-on-action';
      case 64:
        return 'bg-[#883760] text-on-action font-bold';
      case 128:
        return 'bg-[#e5ab60] text-[#302017] font-bold';
      case 256:
        return 'bg-[#ecc77d] text-[#302017] font-bold';
      case 512:
        return 'bg-action text-on-action font-extrabold';
      case 1024:
        return 'bg-action text-on-action font-extrabold text-sm';
      case 2048:
        return 'bg-[#51449d] text-on-action font-bold text-sm';
      default:
        return 'bg-control text-transparent';
    }
  };

  return (
    <div className="game-app flex flex-col h-full bg-canvas text-ink p-4 select-none items-center justify-between">
      {/* Score Header */}
      <div className="flex items-center justify-between w-full max-w-[280px] mb-3">
        <h1 className="text-2xl font-semibold text-accent">2048</h1>

        <div className="flex gap-2 text-xs">
          <div className="bg-inset px-2.5 py-1 rounded-lg border border-line text-center">
            <span className="text-[10px] text-muted block font-semibold">Score</span>
            <span className="font-mono font-bold text-ink">{score}</span>
          </div>
          <div className="bg-inset px-2.5 py-1 rounded-lg border border-line text-center">
            <span className="text-[10px] text-muted block font-semibold">Best</span>
            <span className="font-mono font-bold text-accent">{bestScore}</span>
          </div>
        </div>
      </div>

      {/* 4x4 Grid Board */}
      <div className="game-2048-board" onPointerDown={(event) => {
        if (gameOver || event.pointerType === 'mouse' || !event.isPrimary) return;
        swipeStart.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerUp={(event) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start || gameOver) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
        if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? moveLeft : moveRight)();
        else (dy < 0 ? moveUp : moveDown)();
      }} onPointerCancel={() => { swipeStart.current = null; }}>
        {gameOver && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-10">
            <h3 className="text-xl font-bold text-danger mb-2">Game Over</h3>
            <button
              onClick={initGame}
              className="px-4 py-2 bg-action hover:bg-action text-on-action rounded-lg text-xs font-semibold shadow"
            >
              Try Again
            </button>
          </div>
        )}
        {board.map((row, r) =>
          row.map((val, c) => (
            <div
              key={`${r}-${c}`}
              className={`aspect-square rounded-lg flex items-center justify-center font-bold text-lg transition-colors ${getTileColor(
                val
              )}`}
            >
              {val > 0 ? val : ''}
            </div>
          ))
        )}
      </div>

      {/* Controls Footer */}
      <div className="flex items-center justify-between w-full max-w-[280px] mt-3">
        <span className="text-[11px] text-muted">Use arrow keys, WASD, or swipe</span>
        <button
          onClick={initGame}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-action hover:bg-action text-on-action rounded-lg text-xs font-semibold shadow"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>New Game</span>
        </button>
      </div>
    </div>
  );
};
