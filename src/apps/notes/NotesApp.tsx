// AetherOS - Notes & To-Do Application
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { Plus, Trash2, CheckCircle2, Circle, Search } from 'lucide-react';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  category: string;
  completed: boolean;
  updatedAt: number;
}

const STORAGE_PATH = '/home/aether/.config/aetheros/notes.json';

const DEFAULT_NOTES: NoteItem[] = [
  {
    id: 'note-1',
    title: 'Explore AetherOS Shell (aesh)',
    content: 'Try running commands like `fastfetch`, `cat /etc/os-release`, `tree`, and `top`.',
    category: 'Getting Started',
    completed: true,
    updatedAt: Date.now(),
  },
  {
    id: 'note-2',
    title: 'Build Web App in Code Studio',
    content: 'Open Code Studio and preview the interactive counter in the live sandbox.',
    category: 'Development',
    completed: false,
    updatedAt: Date.now(),
  },
  {
    id: 'note-3',
    title: 'Install Minesweeper & 2048',
    content: 'Open Software Center or run `aetherpkg install game2048` from the terminal.',
    category: 'Personal',
    completed: false,
    updatedAt: Date.now(),
  },
];

export const NotesApp: React.FC<AppProps> = () => {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [search, setSearch] = useState('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNotesRef = useRef<NoteItem[]>(notes);

  useEffect(() => {
    pendingNotesRef.current = notes;
  }, [notes]);

  const flushSave = useCallback((dataToSave?: NoteItem[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const data = dataToSave || pendingNotesRef.current;
    try {
      vfs.writeFile(STORAGE_PATH, JSON.stringify(data, null, 2));
    } catch {}
  }, []);

  // Load notes from VFS
  useEffect(() => {
    try {
      if (vfs.exists(STORAGE_PATH)) {
        const raw = vfs.readFile(STORAGE_PATH);
        setNotes(JSON.parse(raw));
      } else {
        setNotes(DEFAULT_NOTES);
        vfs.writeFile(STORAGE_PATH, JSON.stringify(DEFAULT_NOTES, null, 2));
      }
    } catch {
      setNotes(DEFAULT_NOTES);
    }
  }, []);

  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  // Save changes to VFS
  const saveNotes = (updated: NoteItem[], immediate = false) => {
    setNotes(updated);
    pendingNotesRef.current = updated;
    if (immediate) {
      flushSave(updated);
    } else {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        flushSave(updated);
      }, 400);
    }
  };

  const handleAddNote = () => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      title: 'New Note',
      content: '',
      category: 'General',
      completed: false,
      updatedAt: Date.now(),
    };
    const next = [newNote, ...notes];
    saveNotes(next, true);
    setSelectedNoteId(newNote.id);
  };

  const handleDelete = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    saveNotes(next, true);
    if (selectedNoteId === id) {
      setSelectedNoteId(next[0]?.id || '');
    }
  };

  const handleToggleComplete = (id: string) => {
    const next = notes.map((n) => (n.id === id ? { ...n, completed: !n.completed } : n));
    saveNotes(next, true);
  };

  const selectedNote = notes.find((n) => n.id === selectedNoteId) || notes[0];

  const filteredNotes = notes.filter((n) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      n.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full bg-[#111827] text-gray-200 select-none overflow-hidden">
      {/* Sidebar List */}
      <div className="w-56 bg-[#161f2e] border-r border-gray-700/60 flex flex-col">
        {/* Search & Add */}
        <div className="p-2 border-b border-gray-700/60 flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#111827] border border-gray-700 rounded pl-7 pr-2 py-1 text-xs text-white outline-none"
            />
          </div>
          <button
            onClick={handleAddNote}
            className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded"
            title="Add Note"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Notes Items List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {filteredNotes.map((n) => (
            <div
              key={n.id}
              onClick={() => setSelectedNoteId(n.id)}
              className={`p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                selectedNote?.id === n.id
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200'
                  : 'hover:bg-gray-800 text-gray-300'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className={`font-semibold truncate ${n.completed ? 'line-through text-gray-500' : ''}`}>
                  {n.title || 'Untitled'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleComplete(n.id);
                  }}
                  className="text-gray-400 hover:text-cyan-400"
                >
                  {n.completed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Circle className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 line-clamp-1">{n.content || 'No content'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Note Editor Area */}
      {selectedNote ? (
        <div className="flex-1 flex flex-col p-4 bg-[#111827] overflow-hidden select-text">
          <div className="flex items-center justify-between pb-3 border-b border-gray-700/60 mb-3 select-none">
            <input
              type="text"
              value={selectedNote.title}
              onChange={(e) => {
                const val = e.target.value;
                saveNotes(notes.map((n) => (n.id === selectedNote.id ? { ...n, title: val } : n)));
              }}
              className="text-base font-bold bg-transparent text-white outline-none flex-1 font-sans"
              placeholder="Note title..."
            />
            <button
              onClick={() => handleDelete(selectedNote.id)}
              className="p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded"
              title="Delete Note"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <textarea
            value={selectedNote.content}
            onChange={(e) => {
              const val = e.target.value;
              saveNotes(notes.map((n) => (n.id === selectedNote.id ? { ...n, content: val } : n)));
            }}
            placeholder="Type your notes or tasks here..."
            className="flex-1 bg-transparent text-gray-200 outline-none resize-none leading-relaxed text-sm font-sans"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          No note selected
        </div>
      )}
    </div>
  );
};
