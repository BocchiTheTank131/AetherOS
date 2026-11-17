// AetherOS - Main Desktop Surface Component with Icons, Windows & Context Menu
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSystem } from '../../core/context';
import { WindowFrame } from './WindowFrame';
import { AppIcon } from './AppIcon';
import { ContextMenu } from './ContextMenu';
import { wallpaperImage } from './wallpaper';
import { vfs } from '../../vfs/vfs';
import { getMimeType, getAppForFile } from '../../vfs/mime';
import { dialogService } from '../../core/dialog';
import type { VFSEntry, VFSNode } from '../../vfs/types';
import {
  Terminal,
  Folder,
  FileText,
  Settings,
  Trash2,
  Monitor,
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
const GRID_X = 108;
const GRID_Y = 98;
const OFFSET_X = 8;
const OFFSET_Y = 8;

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

  const iconLayer = useRef<HTMLDivElement>(null);
  const [iconArea, setIconArea] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const layer = iconLayer.current;
    if (!layer) return;
    const observer = new ResizeObserver(() => {
      setIconArea({ width: layer.clientWidth, height: layer.clientHeight });
    });
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

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
    const initialLoad = setTimeout(() => { loadDesktopFiles(); loadPositions(); }, 0);
    const unsubscribe = vfs.watch('/home/aether/Desktop', () => {
      loadDesktopFiles();
    });
    return () => { clearTimeout(initialLoad); unsubscribe(); };
  }, [loadDesktopFiles, loadPositions]);

  const defaultIcons: DesktopIcon[] = [
    {
      id: 'welcome',
      name: 'Welcome.txt',
      path: '/home/aether/Desktop/Welcome.txt',
      icon: <AppIcon name="FileText" size={26} tile />,
      action: () => openWindow('text-editor', { filePath: '/home/aether/Desktop/Welcome.txt' }),
    },
    {
      id: 'files',
      name: 'Files',
      path: '/home/aether/Desktop',
      icon: <AppIcon name="Folder" size={26} tile />,
      action: () => openWindow('file-manager', { initialPath: '/home/aether/Desktop' }),
    },
    {
      id: 'terminal',
      name: 'Terminal',
      icon: <AppIcon name="Terminal" size={26} tile />,
      action: () => openWindow('terminal'),
    },
    {
      id: 'code-studio',
      name: 'Code Studio',
      icon: <AppIcon name="Code2" size={26} tile />,
      action: () => openWindow('code-studio'),
    },
    {
      id: 'software',
      name: 'Software Center',
      icon: <AppIcon name="Package" size={26} tile />,
      action: () => openWindow('software-center'),
    },
    {
      id: 'settings',
      name: 'Settings',
      icon: <AppIcon name="Settings" size={26} tile />,
      action: () => openWindow('settings'),
    },
    {
      id: 'trash',
      name: 'Trash',
      path: '/home/aether/.trash',
      icon: <AppIcon name="Trash2" size={26} tile />,
      action: () => openWindow('file-manager', { initialPath: '/home/aether/.trash' }),
    },
  ];

  const handleOpenVfsFile = (entry: VFSEntry) => {
    if (entry.type === 'dir') {
      openWindow('file-manager', { initialPath: entry.path });
    } else {
      const mime = getMimeType(entry.name);
      const targetApp = getAppForFile(entry.name, mime);
      openWindow(targetApp, { filePath: entry.path });
    }
  };

  const getVfsIcon = (entry: VFSEntry) => {
    if (entry.type === 'dir') {
      return <AppIcon name="Folder" size={26} tile />;
    }
    const ext = entry.name.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext || '')) {
      return <AppIcon name="Image" size={26} tile />;
    }
    if (['mp3', 'wav', 'ogg', 'mp4', 'webm'].includes(ext || '')) {
      return <AppIcon name="PlayCircle" size={26} tile />;
    }
    if (['html', 'css', 'js', 'ts', 'jsx', 'tsx', 'json'].includes(ext || '')) {
      return <AppIcon name="Code2" size={26} tile />;
    }
    return <AppIcon name="FileText" size={26} tile />;
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

  const rows = Math.max(1, Math.floor((iconArea.height - OFFSET_Y) / GRID_Y));
  const iconCanvasWidth = Math.max(iconArea.width, OFFSET_X + Math.ceil(allIcons.length / rows) * GRID_X);
  const clampIcon = useCallback(({ x, y }: IconPosition) => ({
    x: Math.max(OFFSET_X, Math.min(iconCanvasWidth - GRID_X, x)),
    y: Math.max(OFFSET_Y, Math.min(iconArea.height - GRID_Y, y)),
  }), [iconArea.height, iconCanvasWidth]);

  const getIconPosition = (iconId: string, index: number): IconPosition => {
    if (draggingIcon?.id === iconId) return { x: draggingIcon.currentX, y: draggingIcon.currentY };
    const col = Math.floor(index / rows);
    const row = index % rows;
    const position = iconPositions[iconId];
    return position && Number.isFinite(position.x) && Number.isFinite(position.y)
      ? clampIcon(position)
      : { x: OFFSET_X + col * GRID_X, y: OFFSET_Y + row * GRID_Y };
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

      const next = clampIcon({ x: cur.startX + dx, y: cur.startY + dy });

      setDraggingIcon({
        ...cur,
        currentX: next.x,
        currentY: next.y,
        hasMoved: moved,
      });
    };

    const handleMouseUp = () => {
      const cur = draggingRef.current;
      if (cur) {
        if (cur.hasMoved) {
          // Snap to nearest grid coordinate
          const snapped = clampIcon({
            x: Math.round((cur.currentX - OFFSET_X) / GRID_X) * GRID_X + OFFSET_X,
            y: Math.round((cur.currentY - OFFSET_Y) / GRID_Y) * GRID_Y + OFFSET_Y,
          });
          const updated = { ...iconPositions, [cur.id]: snapped };
          setIconPositions(updated);
          savePositions(updated);
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
  }, [clampIcon, iconPositions, savePositions]);

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
    const clampedX = Math.max(10, Math.min(e.clientX, window.innerWidth - 228));
    const clampedY = Math.max(10, Math.min(e.clientY, window.innerHeight - 230));
    setContextMenu({ x: clampedX, y: clampedY });
  };

  const handleIconContextMenu = (e: React.MouseEvent, item: DesktopIcon) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setSelectedIconId(item.id);
    const clampedX = Math.max(10, Math.min(e.clientX, window.innerWidth - 228));
    const clampedY = Math.max(10, Math.min(e.clientY, window.innerHeight - 220));
    setIconContextMenu({ x: clampedX, y: clampedY, icon: item });
  };

  const handleCreateFolder = async () => {
    setContextMenu(null);
    const name = await dialogService.prompt({
      title: 'New Folder',
      message: 'Enter name for new directory on Desktop:',
      defaultValue: 'New Folder',
      validate: (v) => (!v.trim() ? 'Folder name cannot be empty' : null),
    });
    if (name) {
      try {
        vfs.mkdir(vfs.resolve('/home/aether/Desktop', name));
        loadDesktopFiles();
      } catch (err: unknown) {
        dialogService.alert({
          title: 'Error Creating Folder',
          message: err instanceof Error ? err.message : 'Failed to create folder',
          level: 'error',
        });
      }
    }
  };

  const handleCreateFile = async () => {
    setContextMenu(null);
    const name = await dialogService.prompt({
      title: 'New File',
      message: 'Enter filename for new document:',
      defaultValue: 'notes.txt',
      validate: (v) => (!v.trim() ? 'Filename cannot be empty' : null),
    });
    if (name) {
      try {
        vfs.writeFile(vfs.resolve('/home/aether/Desktop', name), '');
        loadDesktopFiles();
      } catch (err: unknown) {
        dialogService.alert({
          title: 'Error Creating File',
          message: err instanceof Error ? err.message : 'Failed to create file',
          level: 'error',
        });
      }
    }
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

  const handleRenameIcon = async (icon: DesktopIcon) => {
    setIconContextMenu(null);
    if (!icon.path || !vfs.exists(icon.path)) return;
    const newName = await dialogService.prompt({
      title: 'Rename Desktop Item',
      message: `Enter new name for "${icon.name}":`,
      defaultValue: icon.name,
      validate: (v) => (!v.trim() ? 'Name cannot be empty' : null),
    });
    if (newName && newName !== icon.name) {
      try {
        const dest = vfs.resolve('/home/aether/Desktop', newName);
        vfs.rename(icon.path, dest);
        loadDesktopFiles();
      } catch (err: unknown) {
        dialogService.alert({
          title: 'Rename Failed',
          message: err instanceof Error ? err.message : 'Rename failed',
          level: 'error',
        });
      }
    }
  };

  const handleDeleteIcon = async (icon: DesktopIcon) => {
    setIconContextMenu(null);
    if (!icon.path || !vfs.exists(icon.path)) return;
    const confirmed = await dialogService.confirm({
      title: 'Move to Trash',
      message: `Are you sure you want to move "${icon.name}" to Trash?`,
      confirmText: 'Move to Trash',
      danger: true,
    });
    if (confirmed) {
      try {
        vfs.moveToTrash(icon.path);
        loadDesktopFiles();
      } catch (err: unknown) {
        dialogService.alert({
          title: 'Delete Failed',
          message: err instanceof Error ? err.message : 'Failed to move to trash',
          level: 'error',
        });
      }
    }
  };

  const resolvedWallpaper = useMemo(() => wallpaperImage(theme.wallpaper), [theme.wallpaper]);

  return (
    <div className="desktop select-none" onClick={handleDesktopClick} onContextMenu={handleContextMenu} style={{ backgroundImage: resolvedWallpaper }}>
      <div className="desktop-icon-layer" ref={iconLayer}>
        <div className="desktop-icon-canvas" style={{ width: iconCanvasWidth }}>
            {allIcons.map((item, idx) => {
        const isSelected = selectedIconId === item.id;
        const pos = getIconPosition(item.id, idx);
        const isBeingDragged = draggingIcon?.id === item.id;

        return (
          <button
            type="button"
            key={item.id}
            aria-label={`Open ${item.name} shortcut`}
            aria-pressed={isSelected}
            data-dragging={isBeingDragged}
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
              if (e.detail === 0 || matchMedia('(hover: none)').matches) item.action();
              setSelectedIconId(item.id);
              setContextMenu(null);
              setIconContextMenu(null);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!matchMedia('(hover: none)').matches) item.action();
            }}
            className="desktop-shortcut"
          >
            {item.icon}
            <span className="desktop-shortcut-label">{item.name}</span>
          </button>
        );
      })}
        </div>
      </div>

      <div className="window-layer">
        {windows.map((win) => (
          <div className="workspace-window" key={win.id} hidden={win.workspaceId !== activeWorkspace}>
            <WindowFrame window={win} />
          </div>
        ))}
      </div>

      {/* Right Click Desktop Context Menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} label="Desktop actions" onDismiss={() => setContextMenu(null)}>
          <button
            onClick={handleCreateFolder}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors"
          >
            <Folder className="w-4 h-4 text-accent" />
            <span>New Folder</span>
          </button>
          <button
            onClick={handleCreateFile}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors"
          >
            <FileText className="w-4 h-4 text-positive" />
            <span>New Text File</span>
          </button>

          <div className="h-px bg-control my-1" />

          <button
            onClick={() => {
              openWindow('terminal');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors"
          >
            <Terminal className="w-4 h-4 text-caution" />
            <span>Open in Terminal</span>
          </button>

          <button
            onClick={() => {
              openWindow('settings');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors"
          >
            <Monitor className="w-4 h-4 text-iris" />
            <span>Change Wallpaper...</span>
          </button>

          <button
            onClick={() => {
              openWindow('settings');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors"
          >
            <Settings className="w-4 h-4 text-secondary" />
            <span>Display Settings</span>
          </button>
        </ContextMenu>
      )}

      {/* Right Click Icon Context Menu */}
      {iconContextMenu && (
        <ContextMenu x={iconContextMenu.x} y={iconContextMenu.y} label="Shortcut actions" onDismiss={() => setIconContextMenu(null)}>
          <button
            onClick={() => {
              iconContextMenu.icon.action();
              setIconContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors font-medium"
          >
            <span>Open</span>
          </button>

          {(iconContextMenu.icon.isDynamic ||
            iconContextMenu.icon.path === '/home/aether/Desktop/Welcome.txt') && (
            <>
              <button
                onClick={() => handleRenameIcon(iconContextMenu.icon)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-accent" />
                <span>Rename</span>
              </button>
              <button
                onClick={() => handleDeleteIcon(iconContextMenu.icon)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-danger hover:bg-red-600 hover:text-on-action transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Move to Trash</span>
              </button>
            </>
          )}

          <div className="h-px bg-control my-1" />

          <button
            onClick={() => handleShowProperties(iconContextMenu.icon)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ink hover:bg-action hover:text-on-action transition-colors"
          >
            <Info className="w-3.5 h-3.5 text-muted" />
            <span>Properties</span>
          </button>
        </ContextMenu>
      )}

      {/* File / Item Properties Dialog */}
      {propertiesNode && (
        <div
          onClick={() => setPropertiesNode(null)}
          className="fixed inset-0 z-[10000] bg-black/45 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ui-panel ui-material w-96 max-w-full p-5 text-ink space-y-4"
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
                  {propertiesNode.node
                    ? propertiesNode.node.type === 'dir'
                      ? 'Directory'
                      : propertiesNode.node.mimeType || 'File'
                    : propertiesNode.virtualDesc || 'System Application'}
                </span>
              </div>
              {propertiesNode.node && (
                <>
                  <div className="flex justify-between py-1 border-b border-line">
                    <span className="text-muted">Location:</span>
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
                </>
              )}
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
