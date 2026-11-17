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
  const [notes, setNotes] = useState<NoteItem[]>(() => {
    try {
      if (vfs.exists(STORAGE_PATH)) {
        const raw = vfs.readFile(STORAGE_PATH);
        return JSON.parse(raw);
      }
    } catch {}
    return DEFAULT_NOTES;
  });
  const [selectedNoteId, setSelectedNoteId] = useState<string>(() => {
    try {
      if (vfs.exists(STORAGE_PATH)) {
        const raw = vfs.readFile(STORAGE_PATH);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
      }
    } catch {}
    return 'note-1';
  });
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

  // Ensure file is seeded on disk if missing
  useEffect(() => {
    if (!vfs.exists(STORAGE_PATH)) {
      try {
        vfs.writeFile(STORAGE_PATH, JSON.stringify(DEFAULT_NOTES, null, 2));
      } catch {}
    }
  }, []);

  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  // Save changes to VFS
  const saveNotes = useCallback(
    (updated: NoteItem[], immediate = false) => {
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
    },
    [flushSave]
  );

  const handleAddNote = useCallback(() => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      title: 'New Note',
      content: '',
      category: 'General',
      completed: false,
      updatedAt: Date.now(),
    };
    setNotes((prev) => {
      const next = [newNote, ...prev];
      saveNotes(next, true);
      return next;
    });
    setSelectedNoteId(newNote.id);
  }, [saveNotes]);

  const handleDelete = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== id);
        saveNotes(next, true);
        if (selectedNoteId === id) {
          setSelectedNoteId(next[0]?.id || '');
        }
        return next;
      });
    },
    [saveNotes, selectedNoteId]
  );

  const handleToggleComplete = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, completed: !n.completed } : n));
        saveNotes(next, true);
        return next;
      });
    },
    [saveNotes]
  );

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
    <div className="notes-app flex h-full bg-canvas text-ink select-none overflow-hidden">
      {/* Sidebar List */}
      <div className="notes-sidebar bg-side border-r border-line flex flex-col">
        {/* Search & Add */}
        <div className="p-2 border-b border-line flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-muted" />
            <input
              type="text"
              placeholder="Search notes" aria-label="Search notes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-canvas border border-line rounded pl-7 pr-2 py-1 text-xs text-ink outline-none"
            />
          </div>
          <button
            onClick={handleAddNote}
            className="p-1.5 bg-action hover:bg-action text-on-action rounded"
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
                  ? 'bg-selection border border-accent/40 text-accent'
                  : 'hover:bg-hover text-secondary'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className={`font-semibold truncate ${n.completed ? 'line-through text-muted' : ''}`}>
                  {n.title || 'Untitled'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleComplete(n.id);
                  }}
                  className="text-muted hover:text-accent"
                >
                  {n.completed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-positive" />
                  ) : (
                    <Circle className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-muted line-clamp-1">{n.content || 'No content'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Note Editor Area */}
      {selectedNote ? (
        <div className="notes-editor flex-1 flex flex-col bg-canvas overflow-hidden select-text">
          <div className="flex items-center justify-between pb-3 border-b border-line mb-3 select-none">
            <input
              type="text"
              value={selectedNote.title}
              onChange={(e) => {
                const val = e.target.value;
                saveNotes(notes.map((n) => (n.id === selectedNote.id ? { ...n, title: val } : n)));
              }}
              className="text-lg font-semibold bg-transparent text-ink flex-1 min-w-0"
              placeholder="Note title" aria-label="Note title"
            />
            <button
              onClick={() => handleDelete(selectedNote.id)}
              className="p-1.5 hover:bg-danger/20 text-muted hover:text-danger rounded"
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
            placeholder="Write a note" aria-label="Note content"
            className="flex-1 bg-transparent text-ink outline-none resize-none leading-relaxed text-sm font-sans"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">
          No note selected
        </div>
      )}
    </div>
  );
};
