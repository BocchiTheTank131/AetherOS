// AetherOS - Text Editor Application
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { Save, FilePlus, Search, FileText, X } from 'lucide-react';

interface EditorTab {
  id: string;
  filePath?: string;
  fileName: string;
  content: string;
  savedContent: string;
}

export const TextEditorApp: React.FC<AppProps> = ({ initialProps, setTitle, isFocused }) => {
  const initialFile = (initialProps?.filePath as string) || '';
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [wordWrap, setWordWrap] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const openNewDoc = useCallback(() => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newTab: EditorTab = {
      id,
      fileName: 'Untitled',
      content: '',
      savedContent: '',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  }, []);

  // Initialize with initial file or new document
  useEffect(() => {
    if (initialFile && vfs.exists(initialFile)) {
      try {
        const text = vfs.readFile(initialFile);
        const name = initialFile.split('/').pop() || 'file.txt';
        const newTab: EditorTab = {
          id: `tab-${Date.now()}`,
          filePath: initialFile,
          fileName: name,
          content: text,
          savedContent: text,
        };
        setTabs([newTab]);
        setActiveTabId(newTab.id);
      } catch {
        openNewDoc();
      }
    } else {
      openNewDoc();
    }
  }, [initialFile, openNewDoc]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const isDirty = activeTab ? activeTab.content !== activeTab.savedContent : false;

  useEffect(() => {
    if (setTitle && activeTab) {
      setTitle(`${isDirty ? '• ' : ''}${activeTab.fileName} - Text Editor`);
    }
  }, [activeTab?.fileName, isDirty, setTitle, activeTab]);

  const handleSave = useCallback(() => {
    if (!activeTab) return;
    let path = activeTab.filePath;
    if (!path) {
      const input = prompt('Save file to path:', `/home/aether/Documents/${activeTab.fileName}`);
      if (!input) return;
      path = vfs.resolve('/home/aether', input);
    }

    try {
      vfs.writeFile(path, activeTab.content);
      const name = path.split('/').pop() || 'file.txt';
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? { ...t, filePath: path, fileName: name, savedContent: activeTab.content }
            : t
        )
      );
    } catch (err) {
      alert(`Save error: ${(err as Error).message}`);
    }
  }, [activeTab, activeTabId]);

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetTab = tabs.find((t) => t.id === id);
    if (targetTab && targetTab.content !== targetTab.savedContent) {
      const confirmDiscard = window.confirm(
        `"${targetTab.fileName}" has unsaved changes. Discard changes and close?`
      );
      if (!confirmDiscard) return;
    }

    const remaining = tabs.filter((t) => t.id !== id);
    if (remaining.length === 0) {
      openNewDoc();
    } else {
      setTabs(remaining);
      if (activeTabId === id) {
        setActiveTabId(remaining[0].id);
      }
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, handleSave]);

  const handleCursorMove = () => {
    if (!textareaRef.current) return;
    const text = textareaRef.current.value.substring(0, textareaRef.current.selectionStart);
    const lines = text.split('\n');
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    });
  };

  const handleFindReplace = () => {
    if (!findText || !activeTab) return;
    const nextContent = activeTab.content.replaceAll(findText, replaceText);
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, content: nextContent } : t))
    );
  };

  const linesCount = activeTab?.content.split('\n').length || 1;
  const wordsCount = activeTab?.content.trim() ? activeTab.content.trim().split(/\s+/).length : 0;

  return (
    <div className="flex flex-col h-full bg-[#181824] text-gray-200 text-sm overflow-hidden select-text">
      {/* Top Controls Toolbar */}
      <div className="flex items-center justify-between p-1.5 bg-[#202030] border-b border-gray-700/60 select-none">
        <div className="flex items-center gap-1">
          <button
            onClick={openNewDoc}
            className="p-1.5 rounded hover:bg-gray-700/70 text-gray-300 hover:text-white"
            title="New File"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
            title="Save (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
          <button
            onClick={() => setShowFind((prev) => !prev)}
            className={`p-1.5 rounded hover:bg-gray-700/70 ${showFind ? 'bg-gray-700 text-cyan-400' : 'text-gray-300'}`}
            title="Find & Replace"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={wordWrap}
              onChange={(e) => setWordWrap(e.target.checked)}
              className="rounded"
            />
            <span>Wrap</span>
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center bg-[#151520] border-b border-gray-800 px-2 select-none overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs border-t-2 cursor-pointer ${
              tab.id === activeTabId
                ? 'bg-[#181824] text-white border-cyan-400 font-medium'
                : 'text-gray-400 border-transparent hover:bg-gray-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>{tab.fileName}</span>
            {tab.content !== tab.savedContent && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            )}
            <button
              onClick={(e) => closeTab(tab.id, e)}
              className="p-0.5 hover:bg-red-500/20 hover:text-red-400 rounded ml-1"
              title="Close Tab"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Find and Replace Drawer */}
      {showFind && (
        <div className="flex items-center gap-2 p-2 bg-[#222234] border-b border-gray-700 text-xs">
          <input
            type="text"
            placeholder="Find text..."
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            className="bg-[#181824] border border-gray-600 rounded px-2 py-1 text-white outline-none"
          />
          <input
            type="text"
            placeholder="Replace with..."
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            className="bg-[#181824] border border-gray-600 rounded px-2 py-1 text-white outline-none"
          />
          <button
            onClick={handleFindReplace}
            className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium"
          >
            Replace All
          </button>
        </div>
      )}

      {/* Main Editor Body with Line Numbers */}
      <div className="flex-1 flex overflow-hidden font-mono text-xs">
        {/* Line Numbers */}
        <div
          ref={lineNumbersRef}
          className="w-12 bg-[#14141e] text-gray-500 py-3 pr-2 text-right select-none border-r border-gray-800 overflow-hidden"
        >
          {Array.from({ length: linesCount }, (_, i) => (
            <div key={i + 1} className="leading-5">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={activeTab?.content || ''}
          onChange={(e) => {
            const nextVal = e.target.value;
            setTabs((prev) =>
              prev.map((t) => (t.id === activeTabId ? { ...t, content: nextVal } : t))
            );
          }}
          onScroll={(e) => {
            if (lineNumbersRef.current) {
              lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
            }
          }}
          onSelect={handleCursorMove}
          onKeyUp={handleCursorMove}
          onClick={handleCursorMove}
          wrap={wordWrap ? 'soft' : 'off'}
          spellCheck={false}
          className="flex-1 p-3 bg-transparent text-gray-100 outline-none resize-none leading-5 font-mono overflow-auto"
          placeholder="Start typing..."
        />
      </div>

      {/* Footer Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#13131c] border-t border-gray-800 text-[11px] text-gray-400 select-none">
        <div className="flex items-center gap-3">
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span>{linesCount} lines</span>
          <span>{wordsCount} words</span>
        </div>
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span>{activeTab?.filePath || 'Unsaved'}</span>
        </div>
      </div>
    </div>
  );
};
