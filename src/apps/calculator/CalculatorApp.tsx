// AetherOS - Calculator Application (Standard & Scientific)
import React, { useState, useEffect, useCallback } from 'react';
import type { AppProps } from '../types';
import { History as HistoryIcon, Delete } from 'lucide-react';

export const CalculatorApp: React.FC<AppProps> = ({ isFocused }) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showScientific, setShowScientific] = useState(false);

  const handleDigit = useCallback((d: string) => {
    if (d === '.') {
      if (display.includes('.')) return;
      setDisplay((prev) => (prev === 'Error' ? '0.' : prev + '.'));
      return;
    }
    setDisplay((prev) => (prev === '0' || prev === 'Error' ? d : prev + d));
  }, [display]);

  const handleOperator = useCallback(
    (op: string) => {
      setEquation((prevEq) => {
        if (display === '0' && prevEq && /[+\-×÷]\s*$/.test(prevEq)) {
          return prevEq.replace(/[+\-×÷]\s*$/, `${op} `);
        }
        if (prevEq && display !== '0') {
          try {
            const full = `${prevEq}${display}`;
            const sanitized = full
              .replace(/×/g, '*')
              .replace(/÷/g, '/')
              .replace(/π/g, 'Math.PI')
              .replace(/\be\b/g, 'Math.E');
            const res = Function(`"use strict"; return (${sanitized})`)();
            const formatted = Number.isFinite(res) ? String(+res.toFixed(8)) : 'Error';
            if (formatted !== 'Error') {
              return `${formatted} ${op} `;
            }
          } catch {
            // Fallback
          }
        }
        return `${display} ${op} `;
      });
      setDisplay('0');
    },
    [display]
  );

  const handleClear = useCallback(() => {
    setDisplay('0');
    setEquation('');
  }, []);

  const handleBackspace = useCallback(() => {
    setDisplay((prev) => {
      if (prev.length <= 1 || prev === 'Error') return '0';
      return prev.slice(0, -1);
    });
  }, []);

  const handleEqual = useCallback(() => {
    try {
      const full = `${equation}${display}`;
      // Clean safe math expression without breaking regular words or exponential syntax
      const sanitized = full
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/g, 'Math.PI')
        .replace(/\be\b/g, 'Math.E');

      // Evaluator
      const res = Function(`"use strict"; return (${sanitized})`)();
      const formatted = Number.isFinite(res) ? String(+res.toFixed(8)) : 'Error';

      setHistory((prev) => [`${full} = ${formatted}`, ...prev.slice(0, 19)]);
      setDisplay(formatted);
      setEquation('');
    } catch {
      setDisplay('Error');
    }
  }, [display, equation]);

  const handleMathFn = (fn: string) => {
    try {
      const num = parseFloat(display);
      let res = 0;
      switch (fn) {
        case 'sin':
          res = Math.sin((num * Math.PI) / 180);
          break;
        case 'cos':
          res = Math.cos((num * Math.PI) / 180);
          break;
        case 'tan':
          res = Math.tan((num * Math.PI) / 180);
          break;
        case 'sqrt':
          res = Math.sqrt(num);
          break;
        case 'sqr':
          res = num * num;
          break;
        case 'log':
          res = Math.log10(num);
          break;
        case 'ln':
          res = Math.log(num);
          break;
      }
      setDisplay(String(+res.toFixed(8)));
    } catch {
      setDisplay('Error');
    }
  };

  // Keyboard navigation - strictly constrained to active focus
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isFocused) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
      else if (e.key === '.') handleDigit('.');
      else if (e.key === '+') handleOperator('+');
      else if (e.key === '-') handleOperator('-');
      else if (e.key === '*') handleOperator('×');
      else if (e.key === '/') handleOperator('÷');
      else if (e.key === 'Enter' || e.key === '=') handleEqual();
      else if (e.key === 'Backspace') handleBackspace();
      else if (e.key === 'Escape') handleClear();
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFocused, handleDigit, handleOperator, handleEqual, handleBackspace, handleClear]);

  return (
    <div className="calculator-app flex flex-col h-full bg-canvas text-ink p-3 select-none overflow-auto">
      {/* Top Toggle */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-line text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScientific((prev) => !prev)}
            className="text-accent hover:text-accent font-semibold"
          >
            {showScientific ? 'Standard' : 'Scientific'}
          </button>
          <button
            onClick={() => setShowHistory((prev) => !prev)}
            className={`p-1 rounded ${showHistory ? 'bg-selection text-accent' : 'text-muted hover:text-ink'}`}
            title="Calculation History"
          >
            <HistoryIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <span className="text-muted font-mono text-[11px] truncate max-w-[150px]">
          {equation}
        </span>
      </div>

      {showHistory ? (
        <div className="flex-1 bg-canvas rounded-xl p-3 mb-2 border border-line overflow-y-auto text-xs font-mono space-y-1">
          <div className="text-muted text-[10px] font-sans uppercase font-bold mb-1">History</div>
          {history.length === 0 ? (
            <div className="text-muted text-xs">No previous calculations</div>
          ) : (
            history.map((h, i) => (
              <div key={i} className="text-secondary py-0.5 border-b border-line">{h}</div>
            ))
          )}
        </div>
      ) : (
        /* Main Display */
        <div className="calculator-display bg-inset rounded-xl p-3 mb-3 border border-line text-right">
          <div className="text-3xl font-mono font-semibold truncate text-ink">
            {display}
          </div>
        </div>
      )}

      {/* Button Grid */}
      <div className="flex-1 grid grid-cols-4 gap-1.5 text-sm font-semibold">
        {showScientific && (
          <>
            <button
              onClick={() => handleMathFn('sin')}
              className="bg-control hover:bg-hover rounded-lg p-2 text-accent text-xs"
            >
              sin
            </button>
            <button
              onClick={() => handleMathFn('cos')}
              className="bg-control hover:bg-hover rounded-lg p-2 text-accent text-xs"
            >
              cos
            </button>
            <button
              onClick={() => handleMathFn('tan')}
              className="bg-control hover:bg-hover rounded-lg p-2 text-accent text-xs"
            >
              tan
            </button>
            <button
              onClick={() => handleMathFn('sqrt')}
              className="bg-control hover:bg-hover rounded-lg p-2 text-accent text-xs"
            >
              √
            </button>
          </>
        )}

        <button
          onClick={handleClear}
          className="bg-danger/20 text-danger hover:bg-danger/30 rounded-lg p-2"
        >
          C
        </button>
        <button
          onClick={handleBackspace}
          className="bg-control hover:bg-hover rounded-lg p-2 flex items-center justify-center text-secondary"
        >
          <Delete className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleDigit('(')}
          className="bg-control hover:bg-hover rounded-lg p-2 text-secondary"
        >
          (
        </button>
        <button
          onClick={() => handleOperator('÷')}
          className="bg-selection text-accent hover:bg-selection rounded-lg p-2 text-base"
        >
          ÷
        </button>

        <button
          onClick={() => handleDigit('7')}
          className="bg-control hover:bg-hover rounded-lg p-2"
        >
          7
        </button>
        <button
          onClick={() => handleDigit('8')}
          className="bg-control hover:bg-hover rounded-lg p-2"
        >
          8
        </button>
        <button
          onClick={() => handleDigit('9')}
          className="bg-control hover:bg-hover rounded-lg p-2"
        >
          9
        </button>
        <button
          onClick={() => handleOperator('×')}
          className="bg-selection text-accent hover:bg-selection rounded-lg p-2 text-base"
        >
          ×
        </button>

        <button
          onClick={() => handleDigit('4')}
          className="bg-control hover:bg-hover rounded-lg p-2"
        >
          4
        </button>
        <button
          onClick={() => handleDigit('5')}
          className="bg-control hover:bg-hover rounded-lg p-2"
        >
          5
        </button>
        <button
          onClick={() => handleDigit('6')}
          className="bg-control hover:bg-hover rounded-lg p-2"
        >
          6
        </button>
        <button
          onClick={() => handleOperator('-')}
          className="bg-selection text-accent hover:bg-selection rounded-lg p-2 text-base"
        >
          -
        </button>

        <button
          onClick={() => handleDigit('1')}
          className="bg-control hover:bg-hover rounded-lg p-2"
        >
          1
        </button>
        <button
          onClick={() => handleDigit('2')}
          className="bg-control hover:bg-hover rounded-lg p-2"
        >
          2
        </button>
        <button
          onClick={() => handleDigit('3')}
          className="bg-control hover:bg-hover rounded-lg p-2"
        >
          3
        </button>
        <button
          onClick={() => handleOperator('+')}
          className="bg-selection text-accent hover:bg-selection rounded-lg p-2 text-base"
        >
          +
        </button>

        <button
          onClick={() => handleDigit('0')}
          className="bg-control hover:bg-hover rounded-lg p-2 col-span-2"
        >
          0
        </button>
        <button
          onClick={() => handleDigit('.')}
          className="bg-control hover:bg-hover rounded-lg p-2"
        >
          .
        </button>
        <button
          onClick={handleEqual}
          className="bg-action hover:bg-action text-on-action rounded-lg p-2 text-base font-bold shadow"
        >
          =
        </button>
      </div>
    </div>
  );
};
