// AetherOS - Minesweeper Classic Game
import React, { useState, useEffect } from 'react';
import type { AppProps } from '../types';
import { Bomb, Flag, Trophy } from 'lucide-react';

type CellState = {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  neighborMines: number;
};

const ROWS = 9;
const COLS = 9;
const MINES = 10;

export const MinesweeperApp: React.FC<AppProps> = () => {
  const [grid, setGrid] = useState<CellState[][]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [flagsRemaining, setFlagsRemaining] = useState(MINES);

  const initGame = () => {
    // Generate empty grid
    const newGrid: CellState[][] = Array(ROWS)
      .fill(null)
      .map(() =>
        Array(COLS)
          .fill(null)
          .map(() => ({
            isMine: false,
            isRevealed: false,
            isFlagged: false,
            neighborMines: 0,
          }))
      );

    // Place mines randomly
    let placed = 0;
    while (placed < MINES) {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);
      if (!newGrid[r][c].isMine) {
        newGrid[r][c].isMine = true;
        placed++;
      }
    }

    // Calculate neighbors
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!newGrid[r][c].isMine) {
          let count = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && newGrid[nr][nc].isMine) {
                count++;
              }
            }
          }
          newGrid[r][c].neighborMines = count;
        }
      }
    }

    setGrid(newGrid);
    setGameOver(false);
    setGameWon(false);
    setFlagsRemaining(MINES);
  };

  useEffect(() => {
    initGame();
  }, []);

  const revealCell = (r: number, c: number) => {
    if (gameOver || gameWon || grid[r][c].isRevealed || grid[r][c].isFlagged) return;

    const next = grid.map((row) => row.map((cell) => ({ ...cell })));

    if (next[r][c].isMine) {
      // Hit mine - Game Over
      for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
          if (next[i][j].isMine) next[i][j].isRevealed = true;
        }
      }
      setGrid(next);
      setGameOver(true);
      return;
    }

    // Flood fill reveal
    const reveal = (row: number, col: number) => {
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
      if (next[row][col].isRevealed || next[row][col].isFlagged || next[row][col].isMine) return;

      next[row][col].isRevealed = true;
      if (next[row][col].neighborMines === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            reveal(row + dr, col + dc);
          }
        }
      }
    };

    reveal(r, c);
    setGrid(next);

    // Check Win
    let unrevealedSafe = 0;
    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        if (!next[i][j].isMine && !next[i][j].isRevealed) {
          unrevealedSafe++;
        }
      }
    }
    if (unrevealedSafe === 0) {
      setGameWon(true);
    }
  };

  const toggleFlag = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (gameOver || gameWon || grid[r][c].isRevealed) return;

    const next = grid.map((row) => row.map((cell) => ({ ...cell })));
    const currentFlag = next[r][c].isFlagged;

    if (!currentFlag && flagsRemaining <= 0) return;

    next[r][c].isFlagged = !currentFlag;
    setGrid(next);
    setFlagsRemaining((prev) => (currentFlag ? prev + 1 : prev - 1));
  };

  return (
    <div className="flex flex-col h-full bg-[#1e2330] text-white p-4 select-none items-center justify-between">
      {/* Top Header Scoreboard */}
      <div className="flex items-center justify-between w-full max-w-[280px] bg-[#141824] p-2.5 rounded-xl border border-gray-700 mb-3">
        <div className="flex items-center gap-1.5 font-mono font-bold text-red-400 text-sm">
          <Bomb className="w-4 h-4" />
          <span>{String(flagsRemaining).padStart(2, '0')}</span>
        </div>

        <button
          onClick={initGame}
          className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-yellow-400 font-bold transition-transform active:scale-95"
          title="Restart"
        >
          {gameOver ? '😵' : gameWon ? '😎' : '🙂'}
        </button>

        <div className="text-xs font-semibold text-gray-300">
          {gameWon ? (
            <span className="text-emerald-400 flex items-center gap-1">
              <Trophy className="w-4 h-4" /> Won!
            </span>
          ) : gameOver ? (
            <span className="text-red-400">Game Over</span>
          ) : (
            <span>9x9</span>
          )}
        </div>
      </div>

      {/* 9x9 Grid */}
      <div className="grid grid-cols-9 gap-1 bg-[#141824] p-2 rounded-xl border border-gray-700">
        {grid.map((row, r) =>
          row.map((cell, c) => {
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => revealCell(r, c)}
                onContextMenu={(e) => toggleFlag(e, r, c)}
                className={`w-7 h-7 rounded text-xs font-bold flex items-center justify-center transition-colors shadow-sm ${
                  cell.isRevealed
                    ? cell.isMine
                      ? 'bg-red-600 text-white'
                      : 'bg-[#282f44] text-gray-200'
                    : 'bg-[#374151] hover:bg-[#4b5563] text-transparent'
                }`}
              >
                {cell.isRevealed ? (
                  cell.isMine ? (
                    <Bomb className="w-4 h-4 fill-white" />
                  ) : cell.neighborMines > 0 ? (
                    <span
                      style={{
                        color:
                          cell.neighborMines === 1
                            ? '#38bdf8'
                            : cell.neighborMines === 2
                            ? '#4ade80'
                            : cell.neighborMines === 3
                            ? '#f87171'
                            : '#c084fc',
                      }}
                    >
                      {cell.neighborMines}
                    </span>
                  ) : (
                    ''
                  )
                ) : cell.isFlagged ? (
                  <Flag className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                ) : (
                  ''
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="text-[11px] text-gray-400 text-center mt-3">
        Left-click to reveal • Right-click to flag
      </div>
    </div>
  );
};
