// AetherOS - 2048 Puzzle Game
import React, { useState, useEffect, useCallback } from 'react';
import type { AppProps } from '../types';
import { RotateCcw } from 'lucide-react';

const SIZE = 4;

export const Game2048App: React.FC<AppProps> = ({ isFocused }) => {
  const [board, setBoard] = useState<number[][]>([]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const spawnTile = (b: number[][]): number[][] => {
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
  };

  const initGame = () => {
    let b = Array(SIZE)
      .fill(0)
      .map(() => Array(SIZE).fill(0));
    b = spawnTile(b);
    b = spawnTile(b);
    setBoard(b);
    setScore(0);
    setGameOver(false);
  };

  useEffect(() => {
    initGame();
  }, []);

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
        return 'bg-gray-700 text-gray-100';
      case 4:
        return 'bg-gray-600 text-white';
      case 8:
        return 'bg-amber-600 text-white';
      case 16:
        return 'bg-orange-600 text-white';
      case 32:
        return 'bg-red-500 text-white';
      case 64:
        return 'bg-red-600 text-white font-bold';
      case 128:
        return 'bg-yellow-500 text-gray-900 font-bold';
      case 256:
        return 'bg-yellow-400 text-gray-900 font-bold';
      case 512:
        return 'bg-cyan-500 text-black font-extrabold';
      case 1024:
        return 'bg-cyan-400 text-black font-extrabold text-sm';
      case 2048:
        return 'bg-purple-500 text-white font-extrabold text-sm shadow-lg shadow-purple-500/50';
      default:
        return 'bg-gray-800 text-transparent';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#181d29] text-white p-4 select-none items-center justify-between">
      {/* Score Header */}
      <div className="flex items-center justify-between w-full max-w-[280px] mb-3">
        <h1 className="text-2xl font-black text-cyan-400">2048</h1>

        <div className="flex gap-2 text-xs">
          <div className="bg-[#11141e] px-2.5 py-1 rounded-lg border border-gray-700 text-center">
            <span className="text-[10px] text-gray-400 block uppercase font-bold">Score</span>
            <span className="font-mono font-bold text-white">{score}</span>
          </div>
          <div className="bg-[#11141e] px-2.5 py-1 rounded-lg border border-gray-700 text-center">
            <span className="text-[10px] text-gray-400 block uppercase font-bold">Best</span>
            <span className="font-mono font-bold text-cyan-400">{bestScore}</span>
          </div>
        </div>
      </div>

      {/* 4x4 Grid Board */}
      <div className="relative grid grid-cols-4 gap-2 bg-[#10131d] p-3 rounded-2xl border border-gray-700/80 shadow-xl">
        {gameOver && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-10">
            <h3 className="text-xl font-bold text-red-400 mb-2">Game Over</h3>
            <button
              onClick={initGame}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow"
            >
              Try Again
            </button>
          </div>
        )}
        {board.map((row, r) =>
          row.map((val, c) => (
            <div
              key={`${r}-${c}`}
              className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg transition-transform ${getTileColor(
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
        <span className="text-[11px] text-gray-400">Use arrow keys or WASD</span>
        <button
          onClick={initGame}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold shadow"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>New Game</span>
        </button>
      </div>
    </div>
  );
};
