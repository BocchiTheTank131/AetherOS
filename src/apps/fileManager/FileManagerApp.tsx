// AetherOS - File Manager Application with Sorting, Trash Actions, File Export, and Properties
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import type { VFSEntry, VFSNode } from '../../vfs/types';
import { getAppForFile } from '../../vfs/mime';
import { useSystem } from '../../core/context';
import { dialogService } from '../../core/dialog';
import {
  Folder,
  File,
  FileText,
  FileCode,
  Image as ImageIcon,
  Music,
  Video,
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  LayoutGrid,
  List,
  Eye,
  Trash2,
  Plus,
  Home,
  Monitor,
  HardDrive,
  Download,
  FolderGit2,
  FolderArchive,
  Search,
  Upload,
  Copy,
  Scissors,
  ClipboardPaste,
  ArrowDownUp,
  RotateCcw,
  Info,
  X,
  Edit3,
} from 'lucide-react';

type SortField = 'name' | 'size' | 'type' | 'modified';

export const FileManagerApp: React.FC<AppProps> = ({ initialProps, setTitle, isFocused }) => {
  const { openWindow } = useSystem();
  const [currentPath, setCurrentPath] = useState<string>(
    (initialProps?.initialPath as string) || '/home/aether'
  );
  const [history, setHistory] = useState<string[]>([currentPath]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [entries, setEntries] = useState<VFSEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showHidden, setShowHidden] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [clipboard, setClipboard] = useState<{ op: 'copy' | 'cut'; path: string } | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [propertiesNode, setPropertiesNode] = useState<{ name: string; node: VFSNode } | null>(null);
  const [itemContextMenu, setItemContextMenu] = useState<{
    x: number;
    y: number;
    entry: VFSEntry;
  } | null>(null);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState(currentPath);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  // Load directory entries
  const loadDirectory = useCallback(
    (dirPath: string) => {
      try {
        const list = vfs.readdir(dirPath);
        setEntries(list);
        if (setTitle) {
          const parts = dirPath.split('/').filter(Boolean);
          setTitle(parts.length ? parts[parts.length - 1] : '/');
        }
      } catch {
        setEntries([]);
      }
    },
    [setTitle]
  );

  useEffect(() => {
    loadDirectory(currentPath);
    setPathInput(currentPath);
    const unsub = vfs.watch(currentPath, () => {
      loadDirectory(currentPath);
    });
    return () => unsub();
  }, [currentPath, loadDirectory]);

  useEffect(() => {
    if (isEditingPath && pathInputRef.current) {
      pathInputRef.current.focus();
      pathInputRef.current.select();
    }
  }, [isEditingPath]);

  const handlePathSubmit = (path: string) => {
    setIsEditingPath(false);
    const target = vfs.resolve(currentPath, path.trim());
    try {
      if (vfs.exists(target)) {
        const stat = vfs.stat(target);
        if (stat.isDirectory()) {
          navigateTo(target);
        } else {
          dialogService.alert({
            title: 'Not a Directory',
            message: `${target} is a regular file, not a directory.`,
            level: 'warning',
          });
        }
      } else {
        dialogService.alert({
          title: 'Path Not Found',
          message: `No such directory: ${target}`,
          level: 'error',
        });
      }
    } catch (err) {
      dialogService.alert({
        title: 'Navigation Error',
        message: (err as Error).message,
        level: 'error',
      });
    }
  };

  const navigateTo = (newPath: string) => {
    const resolved = vfs.normalizePath(newPath);
    if (!vfs.exists(resolved) || !vfs.stat(resolved).isDirectory()) return;

    const newHist = history.slice(0, historyIdx + 1);
    newHist.push(resolved);
    setHistory(newHist);
    setHistoryIdx(newHist.length - 1);
    setCurrentPath(resolved);
    setSelectedPaths(new Set());
    setSearchQuery('');
    setItemContextMenu(null);
  };

  const goBack = () => {
    if (historyIdx > 0) {
      setHistoryIdx(historyIdx - 1);
      setCurrentPath(history[historyIdx - 1]);
      setSelectedPaths(new Set());
      setItemContextMenu(null);
    }
  };

  const goForward = () => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(historyIdx + 1);
      setCurrentPath(history[historyIdx + 1]);
      setSelectedPaths(new Set());
      setItemContextMenu(null);
    }
  };

  const goUp = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    const parent = parts.length <= 1 ? '/' : '/' + parts.slice(0, -1).join('/');
    navigateTo(parent);
  };

  const handleItemClick = (e: React.MouseEvent, path: string) => {
    setItemContextMenu(null);
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    } else {
      setSelectedPaths(new Set([path]));
    }
  };

  const handleDoubleClick = (entry: VFSEntry) => {
    if (entry.type === 'dir') {
      navigateTo(entry.path);
    } else {
      const mime = entry.mimeType || 'text/plain';
      const targetApp = getAppForFile(entry.name, mime);
      openWindow(targetApp, { filePath: entry.path });
    }
  };

  const handleCreateFolder = async () => {
    const name = await dialogService.prompt({
      title: 'New Folder',
      message: 'Enter name for new directory:',
      defaultValue: 'New Folder',
      validate: (v) => (!v.trim() ? 'Folder name cannot be empty' : null),
    });
    if (!name) return;
    try {
      vfs.mkdir(vfs.resolve(currentPath, name));
      loadDirectory(currentPath);
    } catch (err) {
      dialogService.alert({
        title: 'Error Creating Folder',
        message: (err as Error).message,
        level: 'error',
      });
    }
  };

  const handleCreateFile = async () => {
    const name = await dialogService.prompt({
      title: 'New File',
      message: 'Enter filename for new document:',
      defaultValue: 'untitled.txt',
      validate: (v) => (!v.trim() ? 'Filename cannot be empty' : null),
    });
    if (!name) return;
    try {
      vfs.writeFile(vfs.resolve(currentPath, name), '');
      loadDirectory(currentPath);
    } catch (err) {
      dialogService.alert({
        title: 'Error Creating File',
        message: (err as Error).message,
        level: 'error',
      });
    }
  };

  const handleDeleteSelected = useCallback(async () => {
    if (selectedPaths.size === 0) return;
    const confirmed = await dialogService.confirm({
      title: 'Delete Items',
      message: `Are you sure you want to delete ${selectedPaths.size} item(s)?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    const isInTrash = currentPath.startsWith('/home/aether/.trash');
    for (const p of selectedPaths) {
      if (isInTrash || p.startsWith('/home/aether/.trash')) {
        try {
          const stat = vfs.stat(p);
          if (stat.isDirectory()) vfs.rmdir(p, { recursive: true });
          else vfs.unlink(p);
        } catch {}
      } else {
        try {
          vfs.moveToTrash(p);
        } catch {
          try {
            const stat = vfs.stat(p);
            if (stat.isDirectory()) vfs.rmdir(p, { recursive: true });
            else vfs.unlink(p);
          } catch {}
        }
      }
    }
    setSelectedPaths(new Set());
    loadDirectory(currentPath);
  }, [selectedPaths, currentPath, loadDirectory]);

  const handleEmptyTrash = async () => {
    const confirmed = await dialogService.confirm({
      title: 'Empty Trash',
      message: 'Permanently delete all items currently in Trash? This cannot be undone.',
      confirmText: 'Empty Trash',
      danger: true,
    });
    if (confirmed) {
      vfs.emptyTrash();
      setSelectedPaths(new Set());
      loadDirectory(currentPath);
    }
  };

  const handleRestoreSelected = () => {
    for (const p of selectedPaths) {
      try {
        vfs.restoreFromTrash(p);
      } catch (err) {
        dialogService.alert({
          title: 'Restore Error',
          message: (err as Error).message,
          level: 'error',
        });
      }
    }
    setSelectedPaths(new Set());
    loadDirectory(currentPath);
  };

  const handleExportSelected = () => {
    if (selectedPaths.size === 0) return;
    const path = Array.from(selectedPaths)[0];
    const node = vfs.getNode(path);
    if (!node || node.type === 'dir') {
      dialogService.alert({
        title: 'Export Restriction',
        message: 'Can only export individual files to your computer.',
        level: 'warning',
      });
      return;
    }

    try {
      const content = node.content || '';
      let blob: Blob;
      if (node.isBinary && content.startsWith('data:')) {
        const parts = content.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
        const binStr = atob(parts[1] || '');
        const len = binStr.length;
        const u8arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          u8arr[i] = binStr.charCodeAt(i);
        }
        blob = new Blob([u8arr], { type: mime });
      } else {
        blob = new Blob([content], { type: node.mimeType || 'text/plain' });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = node.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      dialogService.alert({
        title: 'Export Failed',
        message: (err as Error).message,
        level: 'error',
      });
    }
  };

  const handleCopy = useCallback(() => {
    if (selectedPaths.size === 0) return;
    const first = Array.from(selectedPaths)[0];
    setClipboard({ op: 'copy', path: first });
  }, [selectedPaths]);

  const handleCut = useCallback(() => {
    if (selectedPaths.size === 0) return;
    const first = Array.from(selectedPaths)[0];
    setClipboard({ op: 'cut', path: first });
  }, [selectedPaths]);

  const handlePaste = useCallback(() => {
    if (!clipboard) return;
    try {
      const srcName = clipboard.path.split('/').pop()!;
      const dest = vfs.resolve(currentPath, srcName);
      if (clipboard.op === 'copy') {
        vfs.copy(clipboard.path, dest, { recursive: true });
      } else {
        vfs.rename(clipboard.path, dest);
        setClipboard(null);
      }
      loadDirectory(currentPath);
    } catch (err) {
      dialogService.alert({
        title: 'Paste Failed',
        message: (err as Error).message,
        level: 'error',
      });
    }
  }, [clipboard, currentPath, loadDirectory]);

  const handleRename = async (entry: VFSEntry) => {
    const newName = await dialogService.prompt({
      title: 'Rename',
      message: `Enter new name for "${entry.name}":`,
      defaultValue: entry.name,
      validate: (v) => (!v.trim() ? 'Name cannot be empty' : null),
    });
    if (newName && newName !== entry.name) {
      try {
        const dest = vfs.resolve(currentPath, newName);
        vfs.rename(entry.path, dest);
        loadDirectory(currentPath);
      } catch (err) {
        dialogService.alert({
          title: 'Rename Failed',
          message: (err as Error).message,
          level: 'error',
        });
      }
    }
  };

  const handleShowProperties = (entry: VFSEntry) => {
    const node = vfs.getNode(entry.path);
    if (node) {
      setPropertiesNode({ name: entry.name, node });
    }
    setItemContextMenu(null);
  };

  useEffect(() => {
    if (!isFocused) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setIsEditingPath(true);
        setPathInput(currentPath);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleCut();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePaste();
      } else if (e.key === 'Delete') {
        e.preventDefault();
        handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, currentPath, handleCopy, handleCut, handlePaste, handleDeleteSelected]);

  // Upload file from host browser
  const handleHostUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      const isText =
        file.type.startsWith('text/') ||
        file.type.includes('json') ||
        file.type.includes('javascript') ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.txt');

      if (isText) {
        reader.onload = () => {
          const text = reader.result as string;
          vfs.writeFile(vfs.resolve(currentPath, file.name), text);
          loadDirectory(currentPath);
        };
        reader.readAsText(file);
      } else {
        reader.onload = () => {
          const dataUrl = reader.result as string;
          vfs.writeFile(vfs.resolve(currentPath, file.name), dataUrl, { isBinary: true });
          loadDirectory(currentPath);
        };
        reader.readAsDataURL(file);
      }
    });

    e.target.value = '';
  };

  // Get icon for entry
  const getEntryIcon = (entry: VFSEntry) => {
    if (entry.type === 'dir') {
      return <Folder className="w-8 h-8 text-cyan-400 fill-cyan-400/20" />;
    }
    const mime = entry.mimeType || '';
    if (mime.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-emerald-400" />;
    if (mime.startsWith('audio/')) return <Music className="w-8 h-8 text-pink-400" />;
    if (mime.startsWith('video/')) return <Video className="w-8 h-8 text-purple-400" />;
    if (mime.includes('javascript') || mime.includes('typescript') || mime.includes('html')) {
      return <FileCode className="w-8 h-8 text-amber-400" />;
    }
    if (mime.includes('zip') || mime.includes('tar')) return <Archive className="w-8 h-8 text-yellow-400" />;
    return <FileText className="w-8 h-8 text-blue-300" />;
  };

  // Filter and sort entries
  const processedEntries = entries
    .filter((e) => {
      if (!showHidden && e.name.startsWith('.')) return false;
      if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      // Dirs always first
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (a.type !== 'dir' && b.type === 'dir') return 1;

      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortField === 'size') {
        cmp = (a.size || 0) - (b.size || 0);
      } else if (sortField === 'modified') {
        cmp = (a.modifiedAt || 0) - (b.modifiedAt || 0);
      } else if (sortField === 'type') {
        const extA = a.name.split('.').pop() || '';
        const extB = b.name.split('.').pop() || '';
        cmp = extA.localeCompare(extB);
      }
      return sortAsc ? cmp : -cmp;
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);
  const isInTrash = currentPath === '/home/aether/.trash' || currentPath.startsWith('/home/aether/.trash/');

  const quickLinks = [
    { name: 'Home', path: '/home/aether', icon: <Home className="w-4 h-4 text-cyan-400" /> },
    { name: 'Desktop', path: '/home/aether/Desktop', icon: <Monitor className="w-4 h-4 text-blue-400" /> },
    { name: 'Documents', path: '/home/aether/Documents', icon: <FileText className="w-4 h-4 text-emerald-400" /> },
    { name: 'Downloads', path: '/home/aether/Downloads', icon: <Download className="w-4 h-4 text-amber-400" /> },
    { name: 'Pictures', path: '/home/aether/Pictures', icon: <ImageIcon className="w-4 h-4 text-pink-400" /> },
    { name: 'Projects', path: '/home/aether/Projects', icon: <FolderGit2 className="w-4 h-4 text-indigo-400" /> },
    { name: 'File System', path: '/', icon: <HardDrive className="w-4 h-4 text-gray-400" /> },
    { name: 'Trash', path: '/home/aether/.trash', icon: <Trash2 className="w-4 h-4 text-red-400" /> },
  ];

  return (
    <div className="flex flex-col h-full bg-[#111827] text-gray-200 select-none overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-2 bg-[#1f2937] border-b border-gray-700/60 gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={goBack}
            disabled={historyIdx === 0}
            className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goForward}
            disabled={historyIdx >= history.length - 1}
            className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Forward"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={goUp}
            disabled={currentPath === '/'}
            className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>

        {/* Breadcrumb / Address Bar */}
        {isEditingPath ? (
          <div className="flex-1 flex items-center bg-[#111827] border border-cyan-500 rounded px-2.5 py-1 text-xs font-mono">
            <input
              ref={pathInputRef}
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handlePathSubmit(pathInput);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEditingPath(false);
                  setPathInput(currentPath);
                }
              }}
              onBlur={() => {
                setTimeout(() => setIsEditingPath(false), 200);
              }}
              className="w-full bg-transparent text-white outline-none font-mono"
              placeholder="/path/to/folder"
            />
          </div>
        ) : (
          <div
            onClick={() => {
              setIsEditingPath(true);
              setPathInput(currentPath);
            }}
            className="flex-1 flex items-center bg-[#111827] border border-gray-700 hover:border-gray-500 rounded px-2.5 py-1 text-xs font-mono overflow-x-auto cursor-text group transition-colors"
            title="Click or press Ctrl+L to edit path"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('/');
              }}
              className="hover:text-cyan-400 font-semibold px-1 rounded hover:bg-gray-800"
            >
              /
            </button>
            {breadcrumbs.map((seg, idx) => {
              const segPath = '/' + breadcrumbs.slice(0, idx + 1).join('/');
              return (
                <React.Fragment key={segPath}>
                  <span className="text-gray-500">/</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateTo(segPath);
                    }}
                    className="hover:text-cyan-400 px-1 truncate max-w-[120px] rounded hover:bg-gray-800"
                  >
                    {seg}
                  </button>
                </React.Fragment>
              );
            })}
            <div className="flex-1 min-w-[20px]" />
          </div>
        )}

        {/* Search */}
        <div className="relative w-44">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111827] border border-gray-700 rounded pl-7 pr-2 py-1 text-xs text-white placeholder-gray-400 outline-none focus:border-cyan-500"
          />
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 border-l border-gray-700 pl-2">
          {isInTrash ? (
            <>
              <button
                onClick={handleRestoreSelected}
                disabled={selectedPaths.size === 0}
                className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white text-xs disabled:opacity-30"
                title="Restore selected to Documents"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore</span>
              </button>
              <button
                onClick={handleEmptyTrash}
                className="flex items-center gap-1 px-2 py-1 rounded bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white text-xs"
                title="Empty Trash"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Empty</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleCreateFolder}
                className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white"
                title="New Folder"
              >
                <Folder className="w-4 h-4 text-cyan-400" />
              </button>
              <button
                onClick={handleCreateFile}
                className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white"
                title="New File"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white"
                title="Upload from host computer"
              >
                <Upload className="w-4 h-4 text-amber-400" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleHostUpload}
                className="hidden"
              />

              {/* Export / Download selected file to host */}
              <button
                onClick={handleExportSelected}
                disabled={selectedPaths.size === 0}
                className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                title="Export selected file to computer"
              >
                <Download className="w-4 h-4 text-teal-400" />
              </button>

              {/* Cut, Copy, Paste toolbar actions */}
              <div className="flex items-center gap-0.5 border-l border-gray-700 pl-1 ml-1">
                <button
                  onClick={handleCopy}
                  disabled={selectedPaths.size === 0}
                  className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Copy (Ctrl+C)"
                >
                  <Copy className="w-4 h-4 text-blue-400" />
                </button>
                <button
                  onClick={handleCut}
                  disabled={selectedPaths.size === 0}
                  className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Cut (Ctrl+X)"
                >
                  <Scissors className="w-4 h-4 text-purple-400" />
                </button>
                <button
                  onClick={handlePaste}
                  disabled={!clipboard}
                  className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                  title={clipboard ? `Paste '${clipboard.path.split('/').pop()}' (Ctrl+V)` : 'Paste (Ctrl+V)'}
                >
                  <ClipboardPaste className="w-4 h-4 text-emerald-400" />
                </button>
              </div>
            </>
          )}

          <button
            onClick={() => setShowHidden((prev) => !prev)}
            className={`p-1.5 rounded hover:bg-gray-700 ${showHidden ? 'bg-gray-700 text-cyan-400' : 'text-gray-400'}`}
            title="Toggle Hidden Files"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-300"
            title="Toggle View Mode"
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
          {selectedPaths.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
              title="Delete Selected"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Quick Access Sidebar */}
        <div className="w-44 bg-[#161f2e] border-r border-gray-700/60 p-2 flex flex-col gap-1 overflow-y-auto">
          <span className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase px-2 py-1">
            Places
          </span>
          {quickLinks.map((link) => (
            <button
              key={link.path}
              onClick={() => navigateTo(link.path)}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 text-xs rounded transition-colors ${
                currentPath === link.path
                  ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {link.icon}
              <span className="truncate">{link.name}</span>
            </button>
          ))}
        </div>

        {/* File Grid / List Content */}
        <div
          className="flex-1 p-3 overflow-y-auto"
          onClick={() => {
            setSelectedPaths(new Set());
            setItemContextMenu(null);
          }}
        >
          {processedEntries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
              <FolderArchive className="w-12 h-12 stroke-[1.2]" />
              <p className="text-sm">Folder is empty</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {processedEntries.map((entry) => {
                const isSelected = selectedPaths.has(entry.path);
                return (
                  <div
                    key={entry.path}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleItemClick(e, entry.path);
                    }}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedPaths(new Set([entry.path]));
                      setItemContextMenu({
                        x: Math.min(e.clientX, window.innerWidth - 180),
                        y: Math.min(e.clientY, window.innerHeight - 200),
                        entry,
                      });
                    }}
                    className={`flex flex-col items-center p-2.5 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-500/50 shadow-sm'
                        : 'border-transparent hover:bg-gray-800/60'
                    }`}
                  >
                    {getEntryIcon(entry)}
                    <span className="text-xs text-center mt-2 font-medium line-clamp-2 break-all text-gray-200">
                      {entry.name}
                    </span>
                    <span className="text-[10px] text-gray-400 mt-0.5">
                      {entry.type === 'dir' ? 'Folder' : `${Math.ceil(entry.size / 1024)} KB`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="w-full text-xs">
              <div className="grid grid-cols-12 py-1.5 px-2 text-gray-400 font-medium border-b border-gray-700/60 select-none">
                <button
                  onClick={() => toggleSort('name')}
                  className="col-span-6 flex items-center gap-1 hover:text-white text-left"
                >
                  <span>Name</span>
                  {sortField === 'name' && (
                    <ArrowDownUp className="w-3 h-3 text-cyan-400 inline" />
                  )}
                </button>
                <button
                  onClick={() => toggleSort('size')}
                  className="col-span-2 flex items-center gap-1 hover:text-white text-left"
                >
                  <span>Size</span>
                  {sortField === 'size' && (
                    <ArrowDownUp className="w-3 h-3 text-cyan-400 inline" />
                  )}
                </button>
                <button
                  onClick={() => toggleSort('type')}
                  className="col-span-2 flex items-center gap-1 hover:text-white text-left"
                >
                  <span>Type</span>
                  {sortField === 'type' && (
                    <ArrowDownUp className="w-3 h-3 text-cyan-400 inline" />
                  )}
                </button>
                <button
                  onClick={() => toggleSort('modified')}
                  className="col-span-2 flex items-center gap-1 hover:text-white text-left"
                >
                  <span>Modified</span>
                  {sortField === 'modified' && (
                    <ArrowDownUp className="w-3 h-3 text-cyan-400 inline" />
                  )}
                </button>
              </div>
              {processedEntries.map((entry) => {
                const isSelected = selectedPaths.has(entry.path);
                return (
                  <div
                    key={entry.path}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleItemClick(e, entry.path);
                    }}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedPaths(new Set([entry.path]));
                      setItemContextMenu({
                        x: Math.min(e.clientX, window.innerWidth - 180),
                        y: Math.min(e.clientY, window.innerHeight - 200),
                        entry,
                      });
                    }}
                    className={`grid grid-cols-12 items-center py-1.5 px-2 rounded cursor-pointer ${
                      isSelected ? 'bg-cyan-500/20 text-cyan-200' : 'hover:bg-gray-800'
                    }`}
                  >
                    <div className="col-span-6 flex items-center gap-2 truncate">
                      {entry.type === 'dir' ? (
                        <Folder className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <File className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </div>
                    <span className="col-span-2 text-gray-400">
                      {entry.type === 'dir' ? '-' : `${Math.ceil(entry.size / 1024)} KB`}
                    </span>
                    <span className="col-span-2 text-gray-400 uppercase">
                      {entry.type === 'dir' ? 'Folder' : entry.name.split('.').pop() || 'File'}
                    </span>
                    <span className="col-span-2 text-gray-400">
                      {new Date(entry.modifiedAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Info Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#161f2e] border-t border-gray-700/60 text-[11px] text-gray-400">
        <span>
          {processedEntries.length} item{processedEntries.length === 1 ? '' : 's'}
          {selectedPaths.size > 0 && ` (${selectedPaths.size} selected)`}
        </span>
        <span>AetherOS VFS (Persistent IndexedDB)</span>
      </div>

      {/* Item Context Menu */}
      {itemContextMenu && (
        <div
          style={{ left: itemContextMenu.x, top: itemContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[9999] w-44 rounded-xl border border-gray-700/80 bg-[#161d2b] shadow-2xl p-1.5 text-xs select-none"
        >
          <button
            onClick={() => {
              handleDoubleClick(itemContextMenu.entry);
              setItemContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors font-medium"
          >
            <span>Open</span>
          </button>
          {itemContextMenu.entry.type !== 'dir' && (
            <button
              onClick={() => {
                handleExportSelected();
                setItemContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-teal-400" />
              <span>Export File</span>
            </button>
          )}
          <button
            onClick={() => {
              handleRename(itemContextMenu.entry);
              setItemContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Rename</span>
          </button>
          <button
            onClick={() => {
              handleDeleteSelected();
              setItemContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-600 hover:text-white transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
          <div className="h-px bg-gray-700/60 my-1" />
          <button
            onClick={() => handleShowProperties(itemContextMenu.entry)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors"
          >
            <Info className="w-3.5 h-3.5 text-gray-400" />
            <span>Properties</span>
          </button>
        </div>
      )}

      {/* Properties Dialog */}
      {propertiesNode && (
        <div
          onClick={() => setPropertiesNode(null)}
          className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-96 rounded-2xl bg-[#161d2b] border border-gray-700 shadow-2xl p-5 text-gray-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-700/80 pb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-sm">Properties: {propertiesNode.name}</h3>
              </div>
              <button
                onClick={() => setPropertiesNode(null)}
                className="p-1 rounded-lg hover:bg-gray-700/60 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-800">
                <span className="text-gray-400">Name:</span>
                <span className="font-medium text-white">{propertiesNode.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-800">
                <span className="text-gray-400">Type:</span>
                <span className="font-medium text-gray-200">
                  {propertiesNode.node.type === 'dir'
                    ? 'Directory'
                    : propertiesNode.node.mimeType || 'File'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-800">
                <span className="text-gray-400">Path:</span>
                <span className="font-mono text-cyan-300 truncate max-w-[200px]" title={propertiesNode.node.path}>
                  {propertiesNode.node.path}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-800">
                <span className="text-gray-400">Size:</span>
                <span className="font-medium text-gray-200">
                  {propertiesNode.node.size >= 1024
                    ? `${(propertiesNode.node.size / 1024).toFixed(1)} KB (${propertiesNode.node.size} bytes)`
                    : `${propertiesNode.node.size} bytes`}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-800">
                <span className="text-gray-400">Permissions:</span>
                <span className="font-mono text-emerald-400">
                  0{propertiesNode.node.permissions.toString(8)} (
                  {propertiesNode.node.owner}:{propertiesNode.node.group})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-800">
                <span className="text-gray-400">Modified:</span>
                <span className="text-gray-300">
                  {new Date(propertiesNode.node.modifiedAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setPropertiesNode(null)}
                className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
