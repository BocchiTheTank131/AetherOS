// AetherOS - Professional Code Studio Editor Host
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { tokenizeLine } from './syntaxHighlight';
import type { TSDiagnostic } from '../runtimes/typescript/types';
import { Search, ChevronDown, ChevronUp, X, CornerDownLeft, AlertCircle } from 'lucide-react';

export interface EditorHostProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  filename?: string;
  readOnly?: boolean;
  fontSize?: number;
  tabSize?: number;
  wordWrap?: boolean;
  diagnostics?: TSDiagnostic[];
  onSave?: () => void;
  onCursorChange?: (line: number, col: number) => void;
  highlightLine?: number;
}

export const EditorHost: React.FC<EditorHostProps> = ({
  value,
  onChange,
  language = 'typescript',
  filename = 'file.ts',
  readOnly = false,
  fontSize = 12,
  tabSize = 2,
  wordWrap = false,
  diagnostics = [],
  onSave,
  onCursorChange,
  highlightLine,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeLine, setActiveLine] = useState(1);
  const [_activeCol, setActiveCol] = useState(1);
  const [findOpen, setFindOpen] = useState(false);
  const [goToLineOpen, setGoToLineOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [targetLineInput, setTargetLineInput] = useState('');

  const lines = useMemo(() => value.split('\n'), [value]);

  // Map diagnostics by line number
  const diagnosticsByLine = useMemo(() => {
    const map = new Map<number, TSDiagnostic[]>();
    for (const d of diagnostics) {
      const list = map.get(d.line) || [];
      list.push(d);
      map.set(d.line, list);
    }
    return map;
  }, [diagnostics]);

  // Update cursor position and active line
  const handleSelect = useCallback(() => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const textBefore = value.slice(0, pos);
    const lineNum = textBefore.split('\n').length;
    const colNum = pos - textBefore.lastIndexOf('\n');

    setActiveLine(lineNum);
    setActiveCol(colNum);
    onCursorChange?.(lineNum, colNum);
  }, [value, onCursorChange]);

  // Auto-indentation and bracket closing
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave?.();
      return;
    }

    // Ctrl+F: Find
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setFindOpen(true);
      return;
    }

    // Ctrl+G: Go to line
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
      e.preventDefault();
      setGoToLineOpen(true);
      return;
    }

    if (readOnly) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    // Tab / Shift-Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = ' '.repeat(tabSize);

      if (e.shiftKey) {
        // Unindent
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const currentLineText = value.slice(lineStart, start);
        if (currentLineText.startsWith(spaces)) {
          const nextVal = value.slice(0, lineStart) + value.slice(lineStart + tabSize);
          onChange(nextVal);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, start - tabSize);
          }, 0);
        }
      } else {
        // Indent
        const nextVal = value.substring(0, start) + spaces + value.substring(end);
        onChange(nextVal);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + tabSize;
        }, 0);
      }
      return;
    }

    // Enter: Auto-indent to match preceding line indentation
    if (e.key === 'Enter') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const currentLineText = value.slice(lineStart, start);
      const match = currentLineText.match(/^(\s+)/);
      const leadingSpaces = match ? match[1] : '';

      // If previous character was open bracket, add extra indent
      const prevChar = value[start - 1];
      const extraIndent = prevChar === '{' || prevChar === '[' || prevChar === '(' ? ' '.repeat(tabSize) : '';

      const insertText = '\n' + leadingSpaces + extraIndent;
      const nextVal = value.substring(0, start) + insertText + value.substring(textarea.selectionEnd);
      onChange(nextVal);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + insertText.length;
        handleSelect();
      }, 0);
      return;
    }

    // Auto-bracket closing: ( [ { " ' `
    const bracketPairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'",
      '`': '`',
    };

    if (e.key in bracketPairs && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const closeChar = bracketPairs[e.key];
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (start !== end) {
        // Wrap selection in brackets
        e.preventDefault();
        const selected = value.substring(start, end);
        const wrapped = e.key + selected + closeChar;
        const nextVal = value.substring(0, start) + wrapped + value.substring(end);
        onChange(nextVal);
        setTimeout(() => {
          textarea.selectionStart = start + 1;
          textarea.selectionEnd = end + 1;
        }, 0);
        return;
      } else if (e.key === '"' || e.key === "'" || e.key === '`') {
        // Don't auto-close quotes if immediately preceded by word character
        const prevChar = value[start - 1] || '';
        if (/[a-zA-Z0-9_]/.test(prevChar)) return;
      }

      e.preventDefault();
      const nextVal = value.substring(0, start) + e.key + closeChar + value.substring(start);
      onChange(nextVal);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }, 0);
      return;
    }
  };

  // Search logic
  useEffect(() => {
    if (!searchQuery) {
      setSearchMatches([]);
      setActiveMatchIndex(0);
      return;
    }
    const matches: number[] = [];
    let pos = 0;
    const lowerQuery = searchQuery.toLowerCase();
    const lowerValue = value.toLowerCase();

    while ((pos = lowerValue.indexOf(lowerQuery, pos)) !== -1) {
      matches.push(pos);
      pos += lowerQuery.length;
    }
    setSearchMatches(matches);
    setActiveMatchIndex(0);
  }, [searchQuery, value]);

  const jumpToMatch = (index: number) => {
    if (searchMatches.length === 0 || !textareaRef.current) return;
    const pos = searchMatches[index];
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(pos, pos + searchQuery.length);
    handleSelect();
  };

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % searchMatches.length;
    setActiveMatchIndex(nextIdx);
    jumpToMatch(nextIdx);
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setActiveMatchIndex(prevIdx);
    jumpToMatch(prevIdx);
  };

  const handleReplace = () => {
    if (searchMatches.length === 0 || !textareaRef.current) return;
    const pos = searchMatches[activeMatchIndex];
    const nextVal = value.slice(0, pos) + replaceQuery + value.slice(pos + searchQuery.length);
    onChange(nextVal);
  };

  const handleReplaceAll = () => {
    if (!searchQuery) return;
    const nextVal = value.replaceAll(searchQuery, replaceQuery);
    onChange(nextVal);
  };

  const handleGoToLine = () => {
    const lineNum = parseInt(targetLineInput, 10);
    if (!isNaN(lineNum) && lineNum >= 1 && lineNum <= lines.length && textareaRef.current) {
      let charPos = 0;
      for (let i = 0; i < lineNum - 1; i++) {
        charPos += lines[i].length + 1;
      }
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(charPos, charPos);
      handleSelect();
      setGoToLineOpen(false);
      setTargetLineInput('');
    }
  };

  // Jump to highlight line prop if provided
  useEffect(() => {
    if (highlightLine && highlightLine >= 1 && highlightLine <= lines.length && textareaRef.current) {
      let charPos = 0;
      for (let i = 0; i < highlightLine - 1; i++) {
        charPos += lines[i].length + 1;
      }
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(charPos, charPos);
      handleSelect();
    }
  }, [highlightLine, lines, handleSelect]);

  // Detect language from filename if not specified
  const effectiveLang = useMemo(() => {
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript';
    if (filename.endsWith('.json')) return 'json';
    if (filename.endsWith('.html')) return 'html';
    if (filename.endsWith('.css')) return 'css';
    if (filename.endsWith('.sh') || filename.endsWith('.bash')) return 'shell';
    if (filename.endsWith('.md')) return 'markdown';
    return language;
  }, [filename, language]);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full w-full bg-[#0d1117] text-gray-200 font-mono select-text overflow-hidden"
      style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize * 1.5}px` }}
    >
      {/* Search & Replace Floating Bar */}
      {findOpen && (
        <div className="absolute top-2 right-4 z-40 bg-[#161b22] border border-gray-700 rounded shadow-2xl p-2 flex flex-col gap-1.5 text-xs select-none min-w-[320px]">
          <div className="flex items-center gap-1.5 justify-between">
            <div className="flex items-center gap-1 bg-[#0d1117] border border-gray-700 rounded px-2 py-1 flex-1">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find in file..."
                className="bg-transparent text-white outline-none w-full text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNextMatch();
                  if (e.key === 'Escape') setFindOpen(false);
                }}
              />
              <span className="text-[10px] text-gray-500 whitespace-nowrap">
                {searchMatches.length > 0 ? `${activeMatchIndex + 1} of ${searchMatches.length}` : '0 results'}
              </span>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={handlePrevMatch}
                disabled={searchMatches.length === 0}
                className="p-1 hover:bg-gray-800 disabled:opacity-40 rounded text-gray-300"
                title="Previous Match"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleNextMatch}
                disabled={searchMatches.length === 0}
                className="p-1 hover:bg-gray-800 disabled:opacity-40 rounded text-gray-300"
                title="Next Match"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setFindOpen(false)}
                className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="Replace with..."
              className="bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-white outline-none flex-1 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReplace();
              }}
            />
            <button
              onClick={handleReplace}
              disabled={searchMatches.length === 0}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded text-[11px] text-gray-300"
            >
              Replace
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={searchMatches.length === 0}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded text-[11px] text-gray-300"
            >
              All
            </button>
          </div>
        </div>
      )}

      {/* Go to Line Modal */}
      {goToLineOpen && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 bg-[#161b22] border border-gray-700 rounded shadow-2xl p-2 flex items-center gap-2 text-xs select-none">
          <span className="text-gray-400">Go to Line:</span>
          <input
            type="number"
            min={1}
            max={lines.length}
            value={targetLineInput}
            onChange={(e) => setTargetLineInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGoToLine();
              if (e.key === 'Escape') setGoToLineOpen(false);
            }}
            placeholder={`1..${lines.length}`}
            className="w-20 px-2 py-1 bg-[#0d1117] border border-gray-700 rounded text-white outline-none"
            autoFocus
          />
          <button
            onClick={handleGoToLine}
            className="p-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded"
            title="Go"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setGoToLineOpen(false)}
            className="p-1 text-gray-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editor Body Area: Gutter + Syntax Surface */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Line Numbers Gutter */}
        <div className="bg-[#0b0e14] border-r border-gray-800 py-3 select-none flex flex-col text-right text-gray-600 font-mono pr-2.5 pl-3 min-w-[42px] overflow-hidden">
          {lines.map((_, idx) => {
            const lineNum = idx + 1;
            const isCurr = lineNum === activeLine;
            const lineDiags = diagnosticsByLine.get(lineNum);
            const hasError = lineDiags?.some((d) => d.severity === 'error');

            return (
              <div
                key={lineNum}
                className={`relative flex items-center justify-end leading-[inherit] ${
                  isCurr ? 'text-cyan-400 font-semibold' : ''
                }`}
              >
                {hasError && (
                  <AlertCircle className="w-2.5 h-2.5 text-rose-500 absolute -left-2 top-1" />
                )}
                <span>{lineNum}</span>
              </div>
            );
          })}
        </div>

        {/* Syntax Render Layer & Interactive Textarea */}
        <div className="flex-1 relative overflow-auto">
          {/* Active Line Background Indicator */}
          <div
            className="absolute left-0 right-0 pointer-events-none bg-cyan-950/20 border-y border-cyan-800/20"
            style={{
              top: `${(activeLine - 1) * fontSize * 1.5 + 12}px`,
              height: `${fontSize * 1.5}px`,
            }}
          />

          {/* Syntax Highlighted Mirror Layer */}
          <div
            className={`p-3 absolute inset-0 pointer-events-none font-mono ${
              wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
            style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize * 1.5}px` }}
            aria-hidden="true"
          >
            {lines.map((lineText, lineIdx) => {
              const lineNum = lineIdx + 1;
              const tokens = tokenizeLine(lineText, effectiveLang);
              const lineDiags = diagnosticsByLine.get(lineNum);

              return (
                <div key={lineIdx} className="leading-[inherit] relative">
                  {tokens.map((tok, tokIdx) => {
                    let colorClass = 'text-gray-300';
                    if (tok.type === 'keyword') colorClass = 'text-purple-400 font-semibold';
                    else if (tok.type === 'string') colorClass = 'text-emerald-300';
                    else if (tok.type === 'number') colorClass = 'text-amber-300';
                    else if (tok.type === 'comment') colorClass = 'text-gray-500 italic';
                    else if (tok.type === 'function') colorClass = 'text-blue-400';
                    else if (tok.type === 'type') colorClass = 'text-teal-300';
                    else if (tok.type === 'tag') colorClass = 'text-rose-400 font-medium';
                    else if (tok.type === 'attr') colorClass = 'text-amber-400';
                    else if (tok.type === 'punctuation') colorClass = 'text-gray-400';

                    return (
                      <span key={tokIdx} className={colorClass}>
                        {tok.text}
                      </span>
                    );
                  })}
                  {lineDiags && lineDiags.length > 0 && (
                    <div
                      className="absolute bottom-0 left-0 right-0 border-b-2 border-dotted border-rose-500"
                      title={lineDiags.map((d) => d.message).join('\n')}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Actual Input Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onSelect={handleSelect}
            onClick={handleSelect}
            onKeyUp={handleSelect}
            onKeyDown={handleKeyDown}
            readOnly={readOnly}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className={`w-full h-full p-3 bg-transparent text-transparent caret-cyan-400 outline-none resize-none font-mono ${
              wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
            style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize * 1.5}px` }}
          />
        </div>
      </div>
    </div>
  );
};
