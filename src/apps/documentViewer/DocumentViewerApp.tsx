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
    if (vfs.exists(filePath)) {
      try {
        const text = vfs.readFile(filePath);
        setContent(text);
        if (setTitle) setTitle(`${filePath.split('/').pop()} - Document Viewer`);
      } catch {}
    }
  }, [filePath, setTitle]);

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
              <li key={item.key} className="text-xs text-gray-300 leading-relaxed">
                {item.text}
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
              className="bg-[#111827] border border-gray-800 p-3 rounded-lg font-mono text-xs text-cyan-300 my-2 overflow-x-auto"
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
          <h1 key={idx} className="text-xl font-bold text-white border-b border-gray-700/60 pb-2 mt-4 mb-2">
            {line.replace('# ', '')}
          </h1>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h2 key={idx} className="text-base font-bold text-cyan-400 mt-4 mb-1">
            {line.replace('## ', '')}
          </h2>
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <h3 key={idx} className="text-sm font-semibold text-purple-400 mt-3 mb-1">
            {line.replace('### ', '')}
          </h3>
        );
      } else if (line.startsWith('> ')) {
        elements.push(
          <blockquote key={idx} className="border-l-4 border-cyan-500 pl-3 my-2 text-xs italic text-gray-400">
            {line.replace('> ', '')}
          </blockquote>
        );
      } else if (line.trim() === '') {
        elements.push(<div key={idx} className="h-2" />);
      } else {
        elements.push(
          <p key={idx} className="text-xs text-gray-300 leading-relaxed my-1">
            {line}
          </p>
        );
      }
    });

    flushList();
    return elements;
  };

  return (
    <div className="flex flex-col h-full bg-[#161a24] text-gray-200 select-text overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between p-2 bg-[#1f2433] border-b border-gray-700/60 select-none text-xs">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-white">{filePath.split('/').pop()}</span>
        </div>

        <div className="flex bg-[#111827] rounded-lg p-0.5 border border-gray-700">
          <button
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
              mode === 'preview' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>Preview</span>
          </button>
          <button
            onClick={() => setMode('source')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
              mode === 'source' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Code className="w-3 h-3" />
            <span>Source</span>
          </button>
        </div>
      </div>

      {/* Main Document Body */}
      <div className="flex-1 p-6 overflow-y-auto">
        {mode === 'preview' ? (
          <div className="max-w-2xl mx-auto space-y-1">{renderMarkdown(content)}</div>
        ) : (
          <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap">{content}</pre>
        )}
      </div>
    </div>
  );
};
