// AetherOS - Minesweeper Classic Game
import React, { useState } from 'react';
import type { AppProps } from '../types';
import { Bomb, Flag, RotateCcw, Trophy } from 'lucide-react';

type CellState = {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  neighborMines: number;
};

const ROWS = 9;
const COLS = 9;
const MINES = 10;

function emptyGrid(): CellState[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({
    isMine: false, isRevealed: false, isFlagged: false, neighborMines: 0,
  })));
}

function chooseMines(positions: number[]): number[] {
  for (let i = 0; i < MINES; i++) {
    const selected = i + Math.floor(Math.random() * (positions.length - i));
    [positions[i], positions[selected]] = [positions[selected], positions[i]];
  }
  return positions.slice(0, MINES);
}

export const MinesweeperApp: React.FC<AppProps> = () => {
  const [flagMode, setFlagMode] = useState(false);
  const [grid, setGrid] = useState(emptyGrid);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [flagsRemaining, setFlagsRemaining] = useState(MINES);
  const [firstClickDone, setFirstClickDone] = useState(false);

  const initGame = () => {
    setGrid(emptyGrid());
    setFlagMode(false);
    setGameOver(false);
    setGameWon(false);
    setFirstClickDone(false);
    setFlagsRemaining(MINES);
  };

  const revealCell = (r: number, c: number) => {
    if (gameOver || gameWon || grid[r][c].isRevealed || grid[r][c].isFlagged) return;

    let baseGrid = grid;
    if (!firstClickDone) {
      // Place mines on first click, avoiding the clicked cell
      const minedGrid: CellState[][] = grid.map((row) => row.map((cell) => ({ ...cell })));
      const positions = Array.from({ length: ROWS * COLS }, (_, index) => index)
        .filter((index) => index !== r * COLS + c);
      for (const index of chooseMines(positions)) {
        minedGrid[Math.floor(index / COLS)][index % COLS].isMine = true;
      }

      // Calculate neighbors
      for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
          if (!minedGrid[i][j].isMine) {
            let count = 0;
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const nr = i + dr;
                const nc = j + dc;
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && minedGrid[nr][nc].isMine) {
                  count++;
                }
              }
            }
            minedGrid[i][j].neighborMines = count;
          }
        }
      }
      baseGrid = minedGrid;
      setFirstClickDone(true);
    }

    const next = baseGrid.map((row) => row.map((cell) => ({ ...cell })));

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

  const toggleFlag = (r: number, c: number) => {
    if (gameOver || gameWon || grid[r][c].isRevealed) return;

    const next = grid.map((row) => row.map((cell) => ({ ...cell })));
    const currentFlag = next[r][c].isFlagged;

    if (!currentFlag && flagsRemaining <= 0) return;

    next[r][c].isFlagged = !currentFlag;
    setGrid(next);
    setFlagsRemaining((prev) => (currentFlag ? prev + 1 : prev - 1));
  };

  return (
    <div className="game-app flex flex-col h-full bg-canvas text-ink p-4 select-none items-center justify-between">
      {/* Top Header Scoreboard */}
      <div className="flex items-center justify-between w-full max-w-[280px] bg-canvas p-2.5 rounded-xl border border-line mb-3">
        <div className="flex items-center gap-1.5 font-mono font-bold text-danger text-sm">
          <Bomb className="w-4 h-4" />
          <span>{String(flagsRemaining).padStart(2, '0')}</span>
        </div>

        <button
          onClick={initGame}
          className="p-1.5 bg-control hover:bg-hover rounded-lg text-caution font-bold transition-transform active:scale-95"
          title="Restart"
        >
          <RotateCcw size={16} />
        </button>

        <div className="text-xs font-semibold text-secondary">
          {gameWon ? (
            <span className="text-positive flex items-center gap-1">
              <Trophy className="w-4 h-4" /> Won!
            </span>
          ) : gameOver ? (
            <span className="text-danger">Game Over</span>
          ) : (
            <span>9x9</span>
          )}
        </div>
      </div>

      {/* 9x9 Grid */}
      <div className="minesweeper-board">
        {grid.map((row, r) =>
          row.map((cell, c) => {
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => flagMode ? toggleFlag(r, c) : revealCell(r, c)}
                onContextMenu={(event) => { event.preventDefault(); toggleFlag(r, c); }}
                aria-label={`Row ${r + 1}, column ${c + 1}, ${cell.isFlagged ? 'flagged' : cell.isRevealed ? cell.isMine ? 'mine' : `${cell.neighborMines} neighboring mines` : 'unrevealed'}`}
                className={`aspect-square rounded text-xs font-bold flex items-center justify-center transition-colors shadow-sm ${
                  cell.isRevealed
                    ? cell.isMine
                      ? 'bg-red-600 text-on-action'
                      : 'bg-control text-ink'
                    : 'bg-control hover:bg-hover text-transparent'
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
                            ? 'var(--ui-accent)'
                            : cell.neighborMines === 2
                            ? 'var(--ui-positive)'
                            : cell.neighborMines === 3
                            ? 'var(--ui-danger)'
                            : 'var(--ui-iris)',
                      }}
                    >
                      {cell.neighborMines}
                    </span>
                  ) : (
                    ''
                  )
                ) : cell.isFlagged ? (
                  <Flag className="w-3.5 h-3.5 text-danger fill-red-400" />
                ) : (
                  ''
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="game-footer">
        <span>Right-click a square to flag it</span>
        <button className="ui-button" aria-pressed={flagMode} onClick={() => setFlagMode((active) => !active)}><Flag size={14} />Flag mode</button>
      </div>
    </div>
  );
};
