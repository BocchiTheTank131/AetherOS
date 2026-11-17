// AetherOS - Document & Markdown Viewer Application
import React, { useState, useEffect } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { BookOpen, Code, Eye } from 'lucide-react';

export const DocumentViewerApp: React.FC<AppProps> = ({ initialProps, setTitle }) => {
  const filePath =
    (initialProps?.filePath as string) || '/home/aether/Documents/GettingStarted.md';
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'preview' | 'source'>('preview');

  useEffect(() => {
    const loadContent = () => {
      if (vfs.exists(filePath)) {
        try {
          const text = vfs.readFile(filePath);
          setContent(text);
          if (setTitle) setTitle(`${filePath.split('/').pop()} - Document Viewer`);
        } catch {}
      }
    };

    loadContent();
    const unsubscribe = vfs.watch(filePath, () => {
      loadContent();
    });
    return () => unsubscribe();
  }, [filePath, setTitle]);

  // Inline markdown formatter for bold, italic, code, links
  const renderInline = (text: string): React.ReactNode => {
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    const parts = text.split(regex);

    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded bg-control text-accent font-mono text-[11px] border border-line"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={i} className="font-semibold text-ink">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return (
          <em key={i} className="italic text-ink">
            {part.slice(1, -1)}
          </em>
        );
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a
            key={i}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent"
          >
            {linkMatch[1]}
          </a>
        );
      }
      return part;
    });
  };

  // Lightweight custom markdown parser
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let listBuffer: { text: string; key: number }[] = [];

    const flushList = () => {
      if (listBuffer.length > 0) {
        elements.push(
          <ul key={`ul-${listBuffer[0].key}`} className="list-disc pl-5 my-2 space-y-1">
            {listBuffer.map((item) => (
              <li key={item.key} className="text-xs text-secondary leading-relaxed">
                {renderInline(item.text)}
              </li>
            ))}
          </ul>
        );
        listBuffer = [];
      }
    };

    lines.forEach((line, idx) => {
      if (line.startsWith('```')) {
        flushList();
        if (inCodeBlock) {
          elements.push(
            <pre
              key={idx}
              className="bg-canvas border border-line p-3 rounded-lg font-mono text-xs text-accent my-2 overflow-x-auto"
            >
              {codeBuffer.join('\n')}
            </pre>
          );
          codeBuffer = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      // Check if bullet list item
      if (line.startsWith('- ') || line.startsWith('* ')) {
        listBuffer.push({ text: line.replace(/^[-*] /, ''), key: idx });
        return;
      }

      flushList();

      // Headers
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={idx} className="text-xl font-bold text-ink border-b border-line pb-2 mt-4 mb-2">
            {renderInline(line.replace('# ', ''))}
          </h1>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h2 key={idx} className="text-base font-bold text-accent mt-4 mb-1">
            {renderInline(line.replace('## ', ''))}
          </h2>
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <h3 key={idx} className="text-sm font-semibold text-iris mt-3 mb-1">
            {renderInline(line.replace('### ', ''))}
          </h3>
        );
      } else if (line.startsWith('> ')) {
        elements.push(
          <blockquote key={idx} className="border-l-4 border-accent pl-3 my-2 text-xs italic text-muted">
            {renderInline(line.replace('> ', ''))}
          </blockquote>
        );
      } else if (line.trim() === '') {
        elements.push(<div key={idx} className="h-2" />);
      } else {
        elements.push(
          <p key={idx} className="text-xs text-secondary leading-relaxed my-1">
            {renderInline(line)}
          </p>
        );
      }
    });

    flushList();
    return elements;
  };

  return (
    <div className="flex flex-col h-full bg-canvas text-ink select-text overflow-hidden">
      {/* Top Header */}
      <div className="app-toolbar flex flex-wrap items-center justify-between gap-2 select-none text-xs">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent" />
          <span className="font-semibold text-ink">{filePath.split('/').pop()}</span>
        </div>

        <div className="flex bg-canvas rounded-lg p-0.5 border border-line">
          <button
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
              mode === 'preview' ? 'bg-action text-on-action' : 'text-muted hover:text-ink'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>Preview</span>
          </button>
          <button
            onClick={() => setMode('source')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
              mode === 'source' ? 'bg-action text-on-action' : 'text-muted hover:text-ink'
            }`}
          >
            <Code className="w-3 h-3" />
            <span>Source</span>
          </button>
        </div>
      </div>

      {/* Main Document Body */}
      <div className="document-page flex-1 overflow-auto">
        {mode === 'preview' ? (
          <div className="max-w-2xl mx-auto space-y-1">{renderMarkdown(content)}</div>
        ) : (
          <pre className="font-mono text-xs text-secondary whitespace-pre-wrap">{content}</pre>
        )}
      </div>
    </div>
  );
};
