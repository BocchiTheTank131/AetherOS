// AetherOS - File Manager Application with Sorting, Trash Actions, File Export, and Properties
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import type { VFSEntry, VFSNode } from '../../vfs/types';
import { getAppForFile } from '../../vfs/mime';
import { useSystem } from '../../core/context';
import { dialogService } from '../../core/dialog';
import { ContextMenu } from '../../desktop/components/ContextMenu';
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

  const fileManagerRef = useRef<HTMLDivElement>(null);
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
    const initialLoad = setTimeout(() => { loadDirectory(currentPath); setPathInput(currentPath); }, 0);
    const unsub = vfs.watch(currentPath, () => {
      loadDirectory(currentPath);
    });
    return () => { clearTimeout(initialLoad); unsub(); };
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

  const showItemMenu = (event: React.MouseEvent, entry: VFSEntry) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = fileManagerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setSelectedPaths(new Set([entry.path]));
    setItemContextMenu({
      x: Math.max(4, Math.min(event.clientX - bounds.left, bounds.width - 210)),
      y: Math.max(4, Math.min(event.clientY - bounds.top, bounds.height - 204)),
      entry,
    });
  };

  // Get icon for entry
  const getEntryIcon = (entry: VFSEntry) => {
    if (entry.type === 'dir') {
      return <Folder size={34} className="text-accent fill-selection" />;
    }
    const mime = entry.mimeType || '';
    if (mime.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-positive" />;
    if (mime.startsWith('audio/')) return <Music className="w-8 h-8 text-flamingo" />;
    if (mime.startsWith('video/')) return <Video className="w-8 h-8 text-iris" />;
    if (mime.includes('javascript') || mime.includes('typescript') || mime.includes('html')) {
      return <FileCode className="w-8 h-8 text-caution" />;
    }
    if (mime.includes('zip') || mime.includes('tar')) return <Archive className="w-8 h-8 text-caution" />;
    return <FileText className="w-8 h-8 text-accent" />;
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
    { name: 'Home', path: '/home/aether', icon: <Home className="w-4 h-4 text-accent" /> },
    { name: 'Desktop', path: '/home/aether/Desktop', icon: <Monitor className="w-4 h-4 text-accent" /> },
    { name: 'Documents', path: '/home/aether/Documents', icon: <FileText className="w-4 h-4 text-positive" /> },
    { name: 'Downloads', path: '/home/aether/Downloads', icon: <Download className="w-4 h-4 text-caution" /> },
    { name: 'Pictures', path: '/home/aether/Pictures', icon: <ImageIcon className="w-4 h-4 text-flamingo" /> },
    { name: 'Projects', path: '/home/aether/Projects', icon: <FolderGit2 className="w-4 h-4 text-iris" /> },
    { name: 'File System', path: '/', icon: <HardDrive className="w-4 h-4 text-muted" /> },
    { name: 'Trash', path: '/home/aether/.trash', icon: <Trash2 className="w-4 h-4 text-danger" /> },
  ];

  return (
    <div className="file-manager flex flex-col h-full bg-canvas text-ink select-none overflow-hidden relative" ref={fileManagerRef}>
      {/* Top Toolbar */}
      <div className="file-toolbar">
        <div className="file-navigation">
          <button
            onClick={goBack}
            disabled={historyIdx === 0}
            className="p-1.5 rounded hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goForward}
            disabled={historyIdx >= history.length - 1}
            className="p-1.5 rounded hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent"
            title="Forward"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={goUp}
            disabled={currentPath === '/'}
            className="p-1.5 rounded hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent"
            title="Up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>

        {/* Breadcrumb / Address Bar */}
        {isEditingPath ? (
          <div className="file-path file-path-edit">
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
              className="w-full bg-transparent text-ink outline-none font-mono"
              placeholder="/path/to/folder"
            />
          </div>
        ) : (
          <div
            onClick={() => {
              setIsEditingPath(true);
              setPathInput(currentPath);
            }}
            className="file-path cursor-text"
            title="Click or press Ctrl+L to edit path"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateTo('/');
              }}
              className="hover:text-accent font-semibold px-1 rounded hover:bg-hover"
            >
              /
            </button>
            {breadcrumbs.map((seg, idx) => {
              const segPath = '/' + breadcrumbs.slice(0, idx + 1).join('/');
              return (
                <React.Fragment key={segPath}>
                  <span className="text-muted">/</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateTo(segPath);
                    }}
                    className="hover:text-accent px-1 truncate max-w-[120px] rounded hover:bg-hover"
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
        <div className="file-search">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted" />
          <input
            type="text"
            placeholder="Filter" aria-label="Filter files"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-canvas border border-line rounded pl-7 pr-2 py-1 text-xs text-ink placeholder-muted outline-none focus:border-accent"
          />
        </div>

        {/* Action Controls */}
        <div className="file-actions">
          {isInTrash ? (
            <>
              <button
                onClick={handleRestoreSelected}
                disabled={selectedPaths.size === 0}
                className="flex items-center gap-1 px-2 py-1 rounded bg-selection hover:bg-action text-accent hover:text-on-action text-xs disabled:opacity-30"
                title="Restore selected to Documents"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore</span>
              </button>
              <button
                onClick={handleEmptyTrash}
                className="flex items-center gap-1 px-2 py-1 rounded bg-danger/30 hover:bg-red-600 text-danger hover:text-on-action text-xs"
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
                className="p-1.5 rounded hover:bg-hover text-secondary hover:text-ink"
                title="New Folder"
              >
                <Folder className="w-4 h-4 text-accent" />
              </button>
              <button
                onClick={handleCreateFile}
                className="p-1.5 rounded hover:bg-hover text-secondary hover:text-ink"
                title="New File"
              >
                <Plus className="w-4 h-4 text-positive" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded hover:bg-hover text-secondary hover:text-ink"
                title="Upload from host computer"
              >
                <Upload className="w-4 h-4 text-caution" />
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
                className="p-1.5 rounded hover:bg-hover text-secondary hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                title="Export selected file to computer"
              >
                <Download className="w-4 h-4 text-aqua" />
              </button>

              {/* Cut, Copy, Paste toolbar actions */}
              <div className="flex items-center gap-0.5 border-l border-line pl-1 ml-1">
                <button
                  onClick={handleCopy}
                  disabled={selectedPaths.size === 0}
                  className="p-1.5 rounded hover:bg-hover text-secondary hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Copy (Ctrl+C)"
                >
                  <Copy className="w-4 h-4 text-accent" />
                </button>
                <button
                  onClick={handleCut}
                  disabled={selectedPaths.size === 0}
                  className="p-1.5 rounded hover:bg-hover text-secondary hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Cut (Ctrl+X)"
                >
                  <Scissors className="w-4 h-4 text-iris" />
                </button>
                <button
                  onClick={handlePaste}
                  disabled={!clipboard}
                  className="p-1.5 rounded hover:bg-hover text-secondary hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                  title={clipboard ? `Paste '${clipboard.path.split('/').pop()}' (Ctrl+V)` : 'Paste (Ctrl+V)'}
                >
                  <ClipboardPaste className="w-4 h-4 text-positive" />
                </button>
              </div>
            </>
          )}

          <button
            onClick={() => setShowHidden((prev) => !prev)}
            className={`p-1.5 rounded hover:bg-hover ${showHidden ? 'bg-control text-accent' : 'text-muted'}`}
            title="Toggle Hidden Files"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-1.5 rounded hover:bg-hover text-secondary"
            title="Toggle View Mode"
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
          {selectedPaths.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="p-1.5 rounded hover:bg-danger/20 text-danger"
              title="Delete Selected"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Split Body */}
      <div className="file-main">
        {/* Quick Access Sidebar */}
        <nav className="file-sidebar" aria-label="Places">
          <span className="file-sidebar-title">
            Places
          </span>
          {quickLinks.map((link) => (
            <button
              key={link.path}
              aria-current={currentPath === link.path ? 'location' : undefined}
              onClick={() => navigateTo(link.path)}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 text-xs rounded transition-colors ${
                currentPath === link.path
                  ? 'bg-selection text-accent font-medium'
                  : 'text-secondary hover:bg-hover'
              }`}
            >
              {link.icon}
              <span className="truncate">{link.name}</span>
            </button>
          ))}
        </nav>

        {/* File Grid / List Content */}
        <div
          className="file-content"
          onClick={() => {
            setSelectedPaths(new Set());
            setItemContextMenu(null);
          }}
        >
          {processedEntries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted gap-2">
              <FolderArchive className="w-12 h-12 stroke-[1.2]" />
              <p className="text-sm">Folder is empty</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="file-grid">
              {processedEntries.map((entry) => {
                const isSelected = selectedPaths.has(entry.path);
                return (
                  <button
                    type="button"
                    key={entry.path}
                    aria-pressed={isSelected}
                    aria-label={entry.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.detail === 0) handleDoubleClick(entry);
                      else handleItemClick(e, entry.path);
                    }}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    onContextMenu={(event) => showItemMenu(event, entry)}
                    className={`file-grid-item border ${
                      isSelected
                        ? 'bg-selection border-accent/50 shadow-sm'
                        : 'border-transparent hover:bg-hover'
                    }`}
                  >
                    {getEntryIcon(entry)}
                    <span className="text-xs text-center mt-2 font-medium line-clamp-2 break-all text-ink">
                      {entry.name}
                    </span>
                    <span className="text-[10px] text-muted mt-0.5">
                      {entry.type === 'dir' ? 'Folder' : `${Math.ceil(entry.size / 1024)} KB`}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="file-details w-full text-xs">
              <div className="grid grid-cols-12 py-1.5 px-2 text-muted font-medium border-b border-line select-none">
                <button
                  onClick={() => toggleSort('name')}
                  className="col-span-6 flex items-center gap-1 hover:text-ink text-left"
                >
                  <span>Name</span>
                  {sortField === 'name' && (
                    <ArrowDownUp className="w-3 h-3 text-accent inline" />
                  )}
                </button>
                <button
                  onClick={() => toggleSort('size')}
                  className="col-span-2 flex items-center gap-1 hover:text-ink text-left"
                >
                  <span>Size</span>
                  {sortField === 'size' && (
                    <ArrowDownUp className="w-3 h-3 text-accent inline" />
                  )}
                </button>
                <button
                  onClick={() => toggleSort('type')}
                  className="col-span-2 flex items-center gap-1 hover:text-ink text-left"
                >
                  <span>Type</span>
                  {sortField === 'type' && (
                    <ArrowDownUp className="w-3 h-3 text-accent inline" />
                  )}
                </button>
                <button
                  onClick={() => toggleSort('modified')}
                  className="col-span-2 flex items-center gap-1 hover:text-ink text-left"
                >
                  <span>Modified</span>
                  {sortField === 'modified' && (
                    <ArrowDownUp className="w-3 h-3 text-accent inline" />
                  )}
                </button>
              </div>
              {processedEntries.map((entry) => {
                const isSelected = selectedPaths.has(entry.path);
                return (
                  <button
                    type="button"
                    key={entry.path}
                    aria-pressed={isSelected}
                    aria-label={entry.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.detail === 0) handleDoubleClick(entry);
                      else handleItemClick(e, entry.path);
                    }}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    onContextMenu={(event) => showItemMenu(event, entry)}
                    className={`grid grid-cols-12 items-center py-1.5 px-2 rounded cursor-pointer ${
                      isSelected ? 'bg-selection text-accent' : 'hover:bg-hover'
                    }`}
                  >
                    <div className="col-span-6 flex items-center gap-2 truncate">
                      {entry.type === 'dir' ? (
                        <Folder className="w-4 h-4 text-accent" />
                      ) : (
                        <File className="w-4 h-4 text-muted" />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </div>
                    <span className="col-span-2 text-muted">
                      {entry.type === 'dir' ? '-' : `${Math.ceil(entry.size / 1024)} KB`}
                    </span>
                    <span className="col-span-2 text-muted uppercase">
                      {entry.type === 'dir' ? 'Folder' : entry.name.split('.').pop() || 'File'}
                    </span>
                    <span className="col-span-2 text-muted">
                      {new Date(entry.modifiedAt).toLocaleDateString()}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Info Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-side border-t border-line text-[11px] text-muted">
        <span>
          {processedEntries.length} item{processedEntries.length === 1 ? '' : 's'}
          {selectedPaths.size > 0 && ` (${selectedPaths.size} selected)`}
        </span>
        <span>AetherOS VFS (Persistent IndexedDB)</span>
      </div>

      {/* Item Context Menu */}
      {itemContextMenu && (
        <ContextMenu contained x={itemContextMenu.x} y={itemContextMenu.y} label="File actions" onDismiss={() => setItemContextMenu(null)}>
          <button
            onClick={() => {
              handleDoubleClick(itemContextMenu.entry);
              setItemContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors font-medium"
          >
            <span>Open</span>
          </button>
          {itemContextMenu.entry.type !== 'dir' && (
            <button
              onClick={() => {
                handleExportSelected();
                setItemContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-aqua" />
              <span>Export File</span>
            </button>
          )}
          <button
            onClick={() => {
              handleRename(itemContextMenu.entry);
              setItemContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-accent" />
            <span>Rename</span>
          </button>
          <button
            onClick={() => {
              handleDeleteSelected();
              setItemContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-danger hover:bg-red-600 hover:text-on-action transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
          <div className="h-px bg-control my-1" />
          <button
            onClick={() => handleShowProperties(itemContextMenu.entry)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors"
          >
            <Info className="w-3.5 h-3.5 text-muted" />
            <span>Properties</span>
          </button>
        </ContextMenu>
      )}

      {/* Properties Dialog */}
      {propertiesNode && (
        <div
          onClick={() => setPropertiesNode(null)}
          className="absolute inset-0 z-[10000] bg-black/45 flex items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ui-panel ui-material w-96 max-w-full max-h-full overflow-auto p-5 text-ink space-y-4"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-accent" />
                <h3 className="font-semibold text-sm">Properties: {propertiesNode.name}</h3>
              </div>
              <button
                onClick={() => setPropertiesNode(null)}
                className="p-1 rounded-lg hover:bg-hover text-muted hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Name:</span>
                <span className="font-medium text-ink">{propertiesNode.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Type:</span>
                <span className="font-medium text-ink">
                  {propertiesNode.node.type === 'dir'
                    ? 'Directory'
                    : propertiesNode.node.mimeType || 'File'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Path:</span>
                <span className="font-mono text-accent truncate max-w-[200px]" title={propertiesNode.node.path}>
                  {propertiesNode.node.path}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Size:</span>
                <span className="font-medium text-ink">
                  {propertiesNode.node.size >= 1024
                    ? `${(propertiesNode.node.size / 1024).toFixed(1)} KB (${propertiesNode.node.size} bytes)`
                    : `${propertiesNode.node.size} bytes`}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Permissions:</span>
                <span className="font-mono text-positive">
                  0{propertiesNode.node.permissions.toString(8)} (
                  {propertiesNode.node.owner}:{propertiesNode.node.group})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Modified:</span>
                <span className="text-secondary">
                  {new Date(propertiesNode.node.modifiedAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setPropertiesNode(null)}
                className="px-4 py-1.5 rounded-lg bg-action hover:bg-action text-on-action text-xs font-medium transition-colors"
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
