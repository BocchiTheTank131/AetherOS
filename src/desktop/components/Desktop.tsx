// AetherOS - Main Desktop Surface Component with Icons, Windows & Context Menu
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSystem } from '../../core/context';
import { WindowFrame } from './WindowFrame';
import { vfs } from '../../vfs/vfs';
import type { VFSEntry, VFSNode } from '../../vfs/types';
import {
  Terminal,
  Folder,
  Code2,
  FileText,
  Settings,
  Package,
  Trash2,
  Monitor,
  Image as ImageIcon,
  PlayCircle,
  Info,
  Edit3,
  X,
  HardDrive,
} from 'lucide-react';

interface DesktopIcon {
  id: string;
  name: string;
  path?: string;
  icon: React.ReactNode;
  action: () => void;
  isDynamic?: boolean;
}

interface IconPosition {
  x: number;
  y: number;
}

const POSITIONS_CONFIG_PATH = '/home/aether/.config/aetheros/desktop_positions.json';
const GRID_X = 84;
const GRID_Y = 96;
const OFFSET_X = 16;
const OFFSET_Y = 16;

export const Desktop: React.FC = () => {
  const {
    theme,
    windows,
    openWindow,
    activeWorkspace,
    setAppLauncherOpen,
    setQuickSettingsOpen,
    setNotificationCenterOpen,
  } = useSystem();

  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [iconContextMenu, setIconContextMenu] = useState<{
    x: number;
    y: number;
    icon: DesktopIcon;
  } | null>(null);
  const [propertiesNode, setPropertiesNode] = useState<{
    name: string;
    node: VFSNode | null;
    virtualDesc?: string;
  } | null>(null);

  const [desktopFiles, setDesktopFiles] = useState<VFSEntry[]>([]);
  const [iconPositions, setIconPositions] = useState<Record<string, IconPosition>>({});

  // Dragging state for icons
  const [draggingIcon, setDraggingIcon] = useState<{
    id: string;
    startX: number;
    startY: number;
    startMouseX: number;
    startMouseY: number;
    currentX: number;
    currentY: number;
    hasMoved: boolean;
  } | null>(null);

  const draggingRef = useRef(draggingIcon);
  useEffect(() => {
    draggingRef.current = draggingIcon;
  }, [draggingIcon]);

  // Load saved icon positions
  const loadPositions = useCallback(() => {
    try {
      if (vfs.exists(POSITIONS_CONFIG_PATH)) {
        const raw = vfs.readFile(POSITIONS_CONFIG_PATH);
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setIconPositions(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const savePositions = useCallback((newPositions: Record<string, IconPosition>) => {
    try {
      if (!vfs.exists('/home/aether/.config')) {
        vfs.mkdir('/home/aether/.config');
      }
      if (!vfs.exists('/home/aether/.config/aetheros')) {
        vfs.mkdir('/home/aether/.config/aetheros');
      }
      vfs.writeFile(POSITIONS_CONFIG_PATH, JSON.stringify(newPositions, null, 2));
    } catch {
      // Ignore
    }
  }, []);

  const loadDesktopFiles = useCallback(() => {
    try {
      if (vfs.exists('/home/aether/Desktop')) {
        const entries = vfs.readdir('/home/aether/Desktop');
        setDesktopFiles(entries.filter((e) => e.name !== 'Welcome.txt'));
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadDesktopFiles();
    loadPositions();
    const unsubscribe = vfs.watch('/home/aether/Desktop', () => {
      loadDesktopFiles();
    });
    return () => unsubscribe();
  }, [loadDesktopFiles, loadPositions]);

  const defaultIcons: DesktopIcon[] = [
    {
      id: 'welcome',
      name: 'Welcome.txt',
      path: '/home/aether/Desktop/Welcome.txt',
      icon: <FileText className="w-10 h-10 text-cyan-400 drop-shadow-md" />,
      action: () => openWindow('text-editor', { filePath: '/home/aether/Desktop/Welcome.txt' }),
    },
    {
      id: 'files',
      name: 'Files',
      path: '/home/aether/Desktop',
      icon: <Folder className="w-10 h-10 text-blue-400 drop-shadow-md" />,
      action: () => openWindow('file-manager', { initialPath: '/home/aether/Desktop' }),
    },
    {
      id: 'terminal',
      name: 'Terminal',
      icon: <Terminal className="w-10 h-10 text-emerald-400 drop-shadow-md" />,
      action: () => openWindow('terminal'),
    },
    {
      id: 'code-studio',
      name: 'Code Studio',
      icon: <Code2 className="w-10 h-10 text-purple-400 drop-shadow-md" />,
      action: () => openWindow('code-studio'),
    },
    {
      id: 'software',
      name: 'Software Center',
      icon: <Package className="w-10 h-10 text-pink-400 drop-shadow-md" />,
      action: () => openWindow('software-center'),
    },
    {
      id: 'settings',
      name: 'Settings',
      icon: <Settings className="w-10 h-10 text-amber-400 drop-shadow-md" />,
      action: () => openWindow('settings'),
    },
    {
      id: 'trash',
      name: 'Trash',
      path: '/home/aether/.trash',
      icon: <Trash2 className="w-10 h-10 text-red-400 drop-shadow-md" />,
      action: () => openWindow('file-manager', { initialPath: '/home/aether/.trash' }),
    },
  ];

  const handleOpenVfsFile = (entry: VFSEntry) => {
    if (entry.type === 'dir') {
      openWindow('file-manager', { initialPath: entry.path });
    } else {
      const ext = entry.name.split('.').pop()?.toLowerCase();
      if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext || '')) {
        openWindow('image-viewer', { filePath: entry.path });
      } else if (['mp3', 'wav', 'ogg', 'mp4', 'webm'].includes(ext || '')) {
        openWindow('media-player', { filePath: entry.path });
      } else if (['html', 'css', 'js', 'ts', 'jsx', 'tsx', 'json'].includes(ext || '')) {
        openWindow('code-studio', { filePath: entry.path });
      } else {
        openWindow('text-editor', { filePath: entry.path });
      }
    }
  };

  const getVfsIcon = (entry: VFSEntry) => {
    if (entry.type === 'dir') {
      return <Folder className="w-10 h-10 text-cyan-300 drop-shadow-md" />;
    }
    const ext = entry.name.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext || '')) {
      return <ImageIcon className="w-10 h-10 text-teal-400 drop-shadow-md" />;
    }
    if (['mp3', 'wav', 'ogg', 'mp4', 'webm'].includes(ext || '')) {
      return <PlayCircle className="w-10 h-10 text-rose-400 drop-shadow-md" />;
    }
    if (['html', 'css', 'js', 'ts', 'jsx', 'tsx', 'json'].includes(ext || '')) {
      return <Code2 className="w-10 h-10 text-emerald-400 drop-shadow-md" />;
    }
    return <FileText className="w-10 h-10 text-blue-300 drop-shadow-md" />;
  };

  const dynamicIcons: DesktopIcon[] = desktopFiles.map((f) => ({
    id: `vfs-${f.path}`,
    name: f.name,
    path: f.path,
    icon: getVfsIcon(f),
    action: () => handleOpenVfsFile(f),
    isDynamic: true,
  }));

  const allIcons = [...defaultIcons, ...dynamicIcons];

  // Helper to get coordinates for an icon
  const getIconPosition = (iconId: string, index: number): IconPosition => {
    if (draggingIcon && draggingIcon.id === iconId) {
      return { x: draggingIcon.currentX, y: draggingIcon.currentY };
    }
    if (iconPositions[iconId]) {
      return iconPositions[iconId];
    }
    // Calculate default grid position
    const maxRows = Math.max(1, Math.floor((window.innerHeight - 100) / GRID_Y));
    const col = Math.floor(index / maxRows);
    const row = index % maxRows;
    return {
      x: OFFSET_X + col * GRID_X,
      y: OFFSET_Y + row * GRID_Y,
    };
  };

  // Icon mouse down -> prepare dragging
  const handleIconMouseDown = (e: React.MouseEvent, item: DesktopIcon, index: number) => {
    if (e.button !== 0) return; // Left click only
    e.stopPropagation();

    const currentPos = getIconPosition(item.id, index);
    setDraggingIcon({
      id: item.id,
      startX: currentPos.x,
      startY: currentPos.y,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      currentX: currentPos.x,
      currentY: currentPos.y,
      hasMoved: false,
    });
    setSelectedIconId(item.id);
    setContextMenu(null);
    setIconContextMenu(null);
  };

  // Drag listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const cur = draggingRef.current;
      if (!cur) return;

      const dx = e.clientX - cur.startMouseX;
      const dy = e.clientY - cur.startMouseY;
      const moved = cur.hasMoved || Math.abs(dx) > 4 || Math.abs(dy) > 4;

      const nextX = Math.max(10, Math.min(window.innerWidth - 90, cur.startX + dx));
      const nextY = Math.max(10, Math.min(window.innerHeight - 110, cur.startY + dy));

      setDraggingIcon({
        ...cur,
        currentX: nextX,
        currentY: nextY,
        hasMoved: moved,
      });
    };

    const handleMouseUp = () => {
      const cur = draggingRef.current;
      if (cur) {
        if (cur.hasMoved) {
          // Snap to nearest grid coordinate
          const snappedX = Math.max(
            OFFSET_X,
            Math.min(
              window.innerWidth - 90,
              Math.round((cur.currentX - OFFSET_X) / GRID_X) * GRID_X + OFFSET_X
            )
          );
          const snappedY = Math.max(
            OFFSET_Y,
            Math.min(
              window.innerHeight - 110,
              Math.round((cur.currentY - OFFSET_Y) / GRID_Y) * GRID_Y + OFFSET_Y
            )
          );

          setIconPositions((prev) => {
            const updated = {
              ...prev,
              [cur.id]: { x: snappedX, y: snappedY },
            };
            savePositions(updated);
            return updated;
          });
        }
        setDraggingIcon(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [savePositions]);

  const handleDesktopClick = () => {
    setSelectedIconId(null);
    setContextMenu(null);
    setIconContextMenu(null);
    setAppLauncherOpen(false);
    setQuickSettingsOpen(false);
    setNotificationCenterOpen(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setIconContextMenu(null);
    const clampedX = Math.max(10, Math.min(e.clientX, window.innerWidth - 210));
    const clampedY = Math.max(10, Math.min(e.clientY, window.innerHeight - 260));
    setContextMenu({ x: clampedX, y: clampedY });
  };

  const handleIconContextMenu = (e: React.MouseEvent, item: DesktopIcon) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setSelectedIconId(item.id);
    const clampedX = Math.max(10, Math.min(e.clientX, window.innerWidth - 200));
    const clampedY = Math.max(10, Math.min(e.clientY, window.innerHeight - 220));
    setIconContextMenu({ x: clampedX, y: clampedY, icon: item });
  };

  const handleCreateFolder = () => {
    const name = prompt('Folder name:', 'New Folder');
    if (name) {
      vfs.mkdir(vfs.resolve('/home/aether/Desktop', name));
      loadDesktopFiles();
    }
    setContextMenu(null);
  };

  const handleCreateFile = () => {
    const name = prompt('File name:', 'notes.txt');
    if (name) {
      vfs.writeFile(vfs.resolve('/home/aether/Desktop', name), '');
      loadDesktopFiles();
    }
    setContextMenu(null);
  };

  const handleShowProperties = (icon: DesktopIcon) => {
    setIconContextMenu(null);
    if (icon.path && vfs.exists(icon.path)) {
      const node = vfs.getNode(icon.path);
      setPropertiesNode({
        name: icon.name,
        node,
      });
    } else {
      setPropertiesNode({
        name: icon.name,
        node: null,
        virtualDesc: 'Built-in System Application shortcut',
      });
    }
  };

  const handleRenameIcon = (icon: DesktopIcon) => {
    setIconContextMenu(null);
    if (!icon.path || !vfs.exists(icon.path)) return;
    const newName = prompt('Enter new name:', icon.name);
    if (newName && newName !== icon.name) {
      try {
        const dest = vfs.resolve('/home/aether/Desktop', newName);
        vfs.rename(icon.path, dest);
        loadDesktopFiles();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Rename failed');
      }
    }
  };

  const handleDeleteIcon = (icon: DesktopIcon) => {
    setIconContextMenu(null);
    if (!icon.path || !vfs.exists(icon.path)) return;
    if (confirm(`Move "${icon.name}" to Trash?`)) {
      try {
        vfs.moveToTrash(icon.path);
        loadDesktopFiles();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to move to trash');
      }
    }
  };

  // Filter windows by active workspace
  const visibleWindows = windows.filter((w) => w.workspaceId === activeWorkspace);

  return (
    <div
      onClick={handleDesktopClick}
      onContextMenu={handleContextMenu}
      style={{
        backgroundImage: `url(${theme.wallpaper})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      className="relative w-full h-full overflow-hidden select-none"
    >
      {/* Freely Placed Desktop Icons */}
      {allIcons.map((item, idx) => {
        const isSelected = selectedIconId === item.id;
        const pos = getIconPosition(item.id, idx);
        const isBeingDragged = draggingIcon?.id === item.id;

        return (
          <div
            key={item.id}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              zIndex: isBeingDragged ? 50 : 10,
            }}
            onMouseDown={(e) => handleIconMouseDown(e, item, idx)}
            onContextMenu={(e) => handleIconContextMenu(e, item)}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIconId(item.id);
              setContextMenu(null);
              setIconContextMenu(null);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              item.action();
            }}
            className={`w-20 p-2 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors duration-75 border ${
              isBeingDragged
                ? 'opacity-80 scale-105 shadow-2xl bg-cyan-500/30 border-cyan-400'
                : isSelected
                ? 'bg-cyan-500/30 border-cyan-400 shadow-lg shadow-cyan-500/20'
                : 'border-transparent hover:bg-black/30'
            }`}
          >
            {item.icon}
            <span className="text-xs font-semibold text-white text-center mt-1.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate max-w-full">
              {item.name}
            </span>
          </div>
        );
      })}

      {/* Render Open Windows */}
      {visibleWindows.map((win) => (
        <WindowFrame key={win.id} window={win} />
      ))}

      {/* Right Click Desktop Context Menu */}
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          className={`fixed z-[9999] w-48 rounded-xl border border-gray-700/80 shadow-2xl p-1.5 text-xs select-none ${
            theme.blur ? 'glass-panel' : 'bg-[#161c28]'
          }`}
        >
          <button
            onClick={handleCreateFolder}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors"
          >
            <Folder className="w-4 h-4 text-cyan-400" />
            <span>New Folder</span>
          </button>
          <button
            onClick={handleCreateFile}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors"
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>New Text File</span>
          </button>

          <div className="h-px bg-gray-700/60 my-1" />

          <button
            onClick={() => {
              openWindow('terminal');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors"
          >
            <Terminal className="w-4 h-4 text-amber-400" />
            <span>Open in Terminal</span>
          </button>

          <button
            onClick={() => {
              openWindow('settings');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors"
          >
            <Monitor className="w-4 h-4 text-purple-400" />
            <span>Change Wallpaper...</span>
          </button>

          <button
            onClick={() => {
              openWindow('settings');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4 text-gray-300" />
            <span>Display Settings</span>
          </button>
        </div>
      )}

      {/* Right Click Icon Context Menu */}
      {iconContextMenu && (
        <div
          style={{ left: iconContextMenu.x, top: iconContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          className={`fixed z-[9999] w-44 rounded-xl border border-gray-700/80 shadow-2xl p-1.5 text-xs select-none ${
            theme.blur ? 'glass-panel' : 'bg-[#161c28]'
          }`}
        >
          <button
            onClick={() => {
              iconContextMenu.icon.action();
              setIconContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors font-medium"
          >
            <span>Open</span>
          </button>

          {(iconContextMenu.icon.isDynamic ||
            iconContextMenu.icon.path === '/home/aether/Desktop/Welcome.txt') && (
            <>
              <button
                onClick={() => handleRenameIcon(iconContextMenu.icon)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Rename</span>
              </button>
              <button
                onClick={() => handleDeleteIcon(iconContextMenu.icon)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-600 hover:text-white transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Move to Trash</span>
              </button>
            </>
          )}

          <div className="h-px bg-gray-700/60 my-1" />

          <button
            onClick={() => handleShowProperties(iconContextMenu.icon)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-200 hover:bg-cyan-600 hover:text-white transition-colors"
          >
            <Info className="w-3.5 h-3.5 text-gray-400" />
            <span>Properties</span>
          </button>
        </div>
      )}

      {/* File / Item Properties Dialog */}
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
                  {propertiesNode.node
                    ? propertiesNode.node.type === 'dir'
                      ? 'Directory'
                      : propertiesNode.node.mimeType || 'File'
                    : propertiesNode.virtualDesc || 'System Application'}
                </span>
              </div>
              {propertiesNode.node && (
                <>
                  <div className="flex justify-between py-1 border-b border-gray-800">
                    <span className="text-gray-400">Location:</span>
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
                </>
              )}
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
