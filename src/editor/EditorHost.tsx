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
  jump?: { line: number; col?: number };
  onComplete?: () => void;
  onDefinition?: () => void;
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
  jump,
  onComplete,
  onDefinition,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const appliedJump = useRef<typeof jump>(undefined);

  const [activeLine, setActiveLine] = useState(1);
  const [findOpen, setFindOpen] = useState(false);
  const [goToLineOpen, setGoToLineOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchIndex, setActiveMatchIndex] = useState(0);
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
    onCursorChange?.(lineNum, colNum);
  }, [value, onCursorChange]);

  // Auto-indentation and bracket closing
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'Space' && onComplete) {
      e.preventDefault();
      onComplete();
      return;
    }
    if (e.key === 'F12' && onDefinition) {
      e.preventDefault();
      onDefinition();
      return;
    }
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

  const searchMatches = useMemo(() => {
    if (!searchQuery) return [];
    const matches: number[] = [];
    let pos = 0;
    const lowerQuery = searchQuery.toLowerCase();
    const lowerValue = value.toLowerCase();

    while ((pos = lowerValue.indexOf(lowerQuery, pos)) !== -1) {
      matches.push(pos);
      pos += lowerQuery.length;
    }
    return matches;
  }, [searchQuery, value]);

  const activeMatchIndex = searchMatches.length ? Math.min(matchIndex, searchMatches.length - 1) : 0;

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

  useEffect(() => {
    if (!jump || appliedJump.current === jump || !textareaRef.current ||
        jump.line < 1 || jump.line > lines.length) return;
    appliedJump.current = jump;
    const before = lines.slice(0, jump.line - 1).reduce((offset, line) => offset + line.length + 1, 0);
    const position = before + Math.min(Math.max((jump.col ?? 1) - 1, 0), lines[jump.line - 1].length);
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(position, position);
    textareaRef.current.scrollTop = Math.max(0, (jump.line - 3) * fontSize * 1.5);
    handleSelect();
  }, [jump, lines, fontSize, handleSelect]);

  // Detect language from filename if not specified
  const effectiveLang = useMemo(() => {
    if (filename.endsWith('.py')) return 'python';
    if (/\.[cm]?tsx?$/.test(filename)) return 'typescript';
    if (/\.[cm]?jsx?$/.test(filename)) return 'javascript';
    if (filename.endsWith('.json')) return 'json';
    if (filename.endsWith('.html')) return 'html';
    if (filename.endsWith('.css')) return 'css';
    if (filename.endsWith('.sh') || filename.endsWith('.bash')) return 'shell';
    if (filename.endsWith('.md')) return 'markdown';
    return language;
  }, [filename, language]);

  const highlighted = useMemo(() =>
    !wordWrap && value.length <= 200_000 && lines.length <= 1800
      ? lines.map((line) => tokenizeLine(line, effectiveLang))
      : null, [wordWrap, value.length, lines, effectiveLang]);

  return (
    <div
      className="relative flex flex-col h-full w-full bg-canvas text-ink font-mono select-text overflow-hidden"
      style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize * 1.5}px` }}
    >
      {/* Search & Replace Floating Bar */}
      {findOpen && (
        <div className="absolute top-2 right-2.5 z-40 ui-card shadow-lg p-2 flex flex-col gap-1.5 text-xs select-none w-[min(340px,calc(100%-20px))] max-w-[calc(100%-20px)]">
          <div className="flex items-center gap-1.5 justify-between">
            <div className="flex items-center gap-1 bg-canvas border border-line rounded px-2 py-1 flex-1">
              <Search className="w-3.5 h-3.5 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setActiveMatchIndex(0); }}
                placeholder="Find in file..."
                className="bg-transparent text-ink outline-none w-full text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNextMatch();
                  if (e.key === 'Escape') setFindOpen(false);
                }}
              />
              <span className="text-[10px] text-muted whitespace-nowrap">
                {searchMatches.length > 0 ? `${activeMatchIndex + 1} of ${searchMatches.length}` : '0 results'}
              </span>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={handlePrevMatch}
                disabled={searchMatches.length === 0}
                className="p-1 hover:bg-hover disabled:opacity-40 rounded text-secondary"
                title="Previous Match"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleNextMatch}
                disabled={searchMatches.length === 0}
                className="p-1 hover:bg-hover disabled:opacity-40 rounded text-secondary"
                title="Next Match"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setFindOpen(false)}
                className="p-1 hover:bg-hover rounded text-muted hover:text-ink"
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
              className="bg-canvas border border-line rounded px-2 py-1 text-ink outline-none flex-1 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReplace();
              }}
            />
            <button
              onClick={handleReplace}
              disabled={searchMatches.length === 0}
              className="px-2 py-1 bg-control hover:bg-hover disabled:opacity-40 rounded text-[11px] text-secondary"
            >
              Replace
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={searchMatches.length === 0}
              className="px-2 py-1 bg-control hover:bg-hover disabled:opacity-40 rounded text-[11px] text-secondary"
            >
              All
            </button>
          </div>
        </div>
      )}

      {/* Go to Line Modal */}
      {goToLineOpen && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 bg-side border border-line rounded shadow-2xl p-2 flex items-center gap-2 text-xs select-none">
          <span className="text-muted">Go to Line:</span>
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
            className="w-20 px-2 py-1 bg-canvas border border-line rounded text-ink outline-none"
            autoFocus
          />
          <button
            onClick={handleGoToLine}
            className="p-1 bg-action hover:bg-action text-on-action rounded"
            title="Go"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setGoToLineOpen(false)}
            className="p-1 text-muted hover:text-ink"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editor Body Area: Gutter + Syntax Surface */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Line Numbers Gutter */}
        {highlighted && <div className="bg-canvas border-r border-line py-3 select-none flex flex-col text-right text-muted font-mono pr-2.5 pl-3 min-w-[42px] overflow-hidden">
          <div ref={gutterRef}>{lines.map((_, idx) => {
            const lineNum = idx + 1;
            const isCurr = lineNum === activeLine;
            const lineDiags = diagnosticsByLine.get(lineNum);
            const hasError = lineDiags?.some((d) => d.severity === 'error');

            return (
              <div
                key={lineNum}
                className={`relative flex items-center justify-end leading-[inherit] ${
                  isCurr ? 'text-accent font-semibold' : ''
                }`}
              >
                {hasError && (
                  <AlertCircle className="w-2.5 h-2.5 text-danger absolute -left-2 top-1" />
                )}
                <span>{lineNum}</span>
              </div>
            );
          })}</div>
        </div>}

        {/* Syntax Render Layer & Interactive Textarea */}
        <div className="flex-1 relative overflow-auto">
          {/* Syntax Highlighted Mirror Layer */}
          {highlighted && <div
            ref={mirrorRef}
            className={`p-3 absolute inset-0 pointer-events-none font-mono ${
              wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
            style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize * 1.5}px` }}
            aria-hidden="true"
          >
            {highlighted.map((tokens, lineIdx) => {
              const lineNum = lineIdx + 1;
              const lineDiags = diagnosticsByLine.get(lineNum);

              return (
                <div key={lineIdx} className={`leading-[inherit] relative min-h-[1lh] ${lineNum === activeLine ? 'bg-selection' : ''}`}>
                  {tokens.map((tok, tokIdx) => {
                    let colorClass = 'text-secondary';
                    if (tok.type === 'keyword') colorClass = 'text-iris font-semibold';
                    else if (tok.type === 'string') colorClass = 'text-positive';
                    else if (tok.type === 'number') colorClass = 'text-caution';
                    else if (tok.type === 'comment') colorClass = 'text-muted italic';
                    else if (tok.type === 'function') colorClass = 'text-accent';
                    else if (tok.type === 'type') colorClass = 'text-aqua';
                    else if (tok.type === 'tag') colorClass = 'text-danger font-medium';
                    else if (tok.type === 'attr') colorClass = 'text-caution';
                    else if (tok.type === 'punctuation') colorClass = 'text-muted';

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
          </div>}

          {/* Actual Input Textarea */}
          <textarea
            ref={textareaRef}
            aria-label={`Edit ${filename}`}
            value={value}
            onScroll={(event) => {
              const { scrollTop, scrollLeft } = event.currentTarget;
              if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-scrollTop}px)`;
              if (mirrorRef.current) mirrorRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
            }}
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
            className={`w-full h-full p-3 bg-transparent caret-accent outline-none resize-none font-mono ${highlighted ? 'text-transparent' : 'text-ink'} ${
              wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
            style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize * 1.5}px` }}
          />
        </div>
      </div>
    </div>
  );
};
