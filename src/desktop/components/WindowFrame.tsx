// AetherOS - Window Frame Component with Draggable Titlebar & 8-Direction Resizing
import React, { useState, useEffect, useCallback } from 'react';
import type { WindowInstance } from '../types';
import { useSystem } from '../../core/context';
import { appRegistry } from '../../apps/appRegistry';
import { AppErrorBoundary } from './AppErrorBoundary';
import {
  Minus,
  Square,
  X,
  Terminal,
  Folder,
  FileText,
  Code2,
  Globe,
  Settings,
  Activity,
  Package,
  Calculator,
  PlayCircle,
  Image as ImageIcon,
  StickyNote,
  BookOpen,
  ScrollText,
  Bomb,
  Grid,
  Palette,
  CloudRain,
  Mic,
} from 'lucide-react';

interface WindowFrameProps {
  window: WindowInstance;
}

export const WindowFrame: React.FC<WindowFrameProps> = ({ window: win }) => {
  const {
    closeWindow,
    focusWindow,
    minimizeWindow,
    maximizeWindow,
    snapWindow,
    updateWindowPosition,
    updateWindowSize,
    updateWindowTitle,
    theme,
  } = useSystem();

  const handleClose = useCallback(() => closeWindow(win.id), [win.id, closeWindow]);
  const handleSetTitle = useCallback((t: string) => updateWindowTitle(win.id, t), [win.id, updateWindowTitle]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingDir, setResizingDir] = useState<string | null>(null);
  const [snapPreview, setSnapPreview] = useState<'left' | 'right' | 'top' | null>(null);
  const [initialResize, setInitialResize] = useState({
    mouseX: 0,
    mouseY: 0,
    winX: 0,
    winY: 0,
    winW: 0,
    winH: 0,
  });

  const appDef = appRegistry.get(win.appId);
  const AppComponent = appDef?.component;

  // Window Icons Map
  const getAppIcon = (iconName: string) => {
    const props = { className: 'w-3.5 h-3.5 text-cyan-400', size: 14 };
    switch (iconName) {
      case 'Terminal':
        return <Terminal {...props} />;
      case 'Folder':
        return <Folder {...props} />;
      case 'FileText':
        return <FileText {...props} />;
      case 'Code2':
        return <Code2 {...props} />;
      case 'Globe':
        return <Globe {...props} />;
      case 'Settings':
        return <Settings {...props} />;
      case 'Activity':
        return <Activity {...props} />;
      case 'Package':
        return <Package {...props} />;
      case 'Calculator':
        return <Calculator {...props} />;
      case 'PlayCircle':
        return <PlayCircle {...props} />;
      case 'Image':
        return <ImageIcon {...props} />;
      case 'StickyNote':
        return <StickyNote {...props} />;
      case 'BookOpen':
        return <BookOpen {...props} />;
      case 'ScrollText':
        return <ScrollText {...props} />;
      case 'Bomb':
        return <Bomb {...props} />;
      case 'Grid':
        return <Grid {...props} />;
      case 'Palette':
        return <Palette {...props} />;
      case 'CloudRain':
        return <CloudRain {...props} />;
      case 'Mic':
        return <Mic {...props} />;
      default:
        if (iconName && (iconName.startsWith('data:') || iconName.includes('/'))) {
          return <img src={iconName} className="w-3.5 h-3.5 object-contain" alt="" />;
        }
        return <Package {...props} />;
    }
  };

  // Dragging logic
  const handleTitlebarMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only

    if (win.state === 'maximized') {
      focusWindow(win.id);
      const restoredW = win.minWidth ? Math.max(win.minWidth, 700) : 700;
      const newX = Math.max(10, Math.min(window.innerWidth - 100, e.clientX - restoredW / 2));
      const newY = Math.max(10, e.clientY - 15);
      maximizeWindow(win.id);
      updateWindowPosition(win.id, newX, newY);
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - newX,
        y: e.clientY - newY,
      });
      return;
    }

    focusWindow(win.id);
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - win.x,
      y: e.clientY - win.y,
    });
  };

  // Resize handler
  const handleResizeMouseDown = (e: React.MouseEvent, dir: string) => {
    e.stopPropagation();
    e.preventDefault();
    focusWindow(win.id);
    setResizingDir(dir);
    setInitialResize({
      mouseX: e.clientX,
      mouseY: e.clientY,
      winX: win.x,
      winY: win.y,
      winW: win.width,
      winH: win.height,
    });
  };

  // Global mouse move & up listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const minTop = theme.dockPosition === 'top' ? 44 : 0;
        const nextX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.x));
        const nextY = Math.max(minTop, Math.min(window.innerHeight - 80, e.clientY - dragOffset.y));

        updateWindowPosition(win.id, nextX, nextY);

        if (e.clientX <= 15) {
          setSnapPreview('left');
        } else if (e.clientX >= window.innerWidth - 15) {
          setSnapPreview('right');
        } else if (e.clientY <= minTop + 15) {
          setSnapPreview('top');
        } else {
          setSnapPreview(null);
        }
      } else if (resizingDir) {
        const dx = e.clientX - initialResize.mouseX;
        const dy = e.clientY - initialResize.mouseY;

        let nextX = initialResize.winX;
        let nextY = initialResize.winY;
        let nextW = initialResize.winW;
        let nextH = initialResize.winH;

        if (resizingDir.includes('e')) {
          nextW = Math.max(win.minWidth, initialResize.winW + dx);
        }
        if (resizingDir.includes('s')) {
          nextH = Math.max(win.minHeight, initialResize.winH + dy);
        }
        if (resizingDir.includes('w')) {
          const clampedW = Math.max(win.minWidth, initialResize.winW - dx);
          nextX = initialResize.winX + (initialResize.winW - clampedW);
          nextW = clampedW;
        }
        if (resizingDir.includes('n')) {
          const clampedH = Math.max(win.minHeight, initialResize.winH - dy);
          nextY = initialResize.winY + (initialResize.winH - clampedH);
          nextH = clampedH;
        }

        updateWindowSize(win.id, nextW, nextH, nextX, nextY);
      }
    };

    const handleMouseUp = () => {
      if (isDragging && snapPreview) {
        snapWindow(win.id, snapPreview);
      }
      setIsDragging(false);
      setResizingDir(null);
      setSnapPreview(null);
    };

    if (isDragging || resizingDir) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    resizingDir,
    snapPreview,
    dragOffset,
    initialResize,
    theme.dockPosition,
    win.id,
    win.minWidth,
    win.minHeight,
    updateWindowPosition,
    updateWindowSize,
    snapWindow,
  ]);

  if (win.state === 'minimized') {
    return null;
  }

  const isDockTop = theme.dockPosition === 'top';
  const isDockLeft = theme.dockPosition === 'left';
  const topOffset = isDockTop ? 44 : 0;
  const leftOffset = isDockLeft ? 56 : 0;
  const heightStyle = isDockTop || theme.dockPosition === 'bottom' ? 'calc(100% - 44px)' : '100%';
  const widthStyle = isDockLeft ? 'calc(100% - 56px)' : '100%';

  // Calculate style based on state
  let style: React.CSSProperties = {
    position: 'absolute',
    left: win.x,
    top: win.y,
    width: win.width,
    height: win.height,
    zIndex: win.zIndex,
  };

  if (win.state === 'maximized') {
    style = {
      position: 'absolute',
      left: leftOffset,
      top: topOffset,
      width: widthStyle,
      height: heightStyle,
      zIndex: win.zIndex,
      borderRadius: 0,
    };
  } else if (win.state === 'snapped-left') {
    style = {
      position: 'absolute',
      left: leftOffset,
      top: topOffset,
      width: isDockLeft ? 'calc(50% - 28px)' : '50%',
      height: heightStyle,
      zIndex: win.zIndex,
      borderRadius: 0,
    };
  } else if (win.state === 'snapped-right') {
    style = {
      position: 'absolute',
      left: isDockLeft ? 'calc(50% + 28px)' : '50%',
      top: topOffset,
      width: isDockLeft ? 'calc(50% - 28px)' : '50%',
      height: heightStyle,
      zIndex: win.zIndex,
      borderRadius: 0,
    };
  }

  const isLight = theme.mode === 'light';

  return (
    <>
      {/* Global dragging & resizing overlay to prevent iframe pointer capture drop */}
      {(isDragging || resizingDir) && (
        <div className="fixed inset-0 z-[99999] cursor-move select-none" />
      )}

      {snapPreview && (
        <div
          style={{
            position: 'fixed',
            left: snapPreview === 'right' ? (isDockLeft ? 'calc(50% + 28px)' : '50%') : leftOffset,
            top: topOffset,
            width: snapPreview === 'top' ? widthStyle : isDockLeft ? 'calc(50% - 28px)' : '50%',
            height: heightStyle,
            zIndex: 9998,
            pointerEvents: 'none',
          }}
          className="border-2 border-cyan-400/80 bg-cyan-500/15 backdrop-blur-[1px] rounded-lg transition-all duration-150 pointer-events-none"
        />
      )}
      <div
        style={style}
        onMouseDown={() => focusWindow(win.id)}
        className={`flex flex-col rounded-xl overflow-hidden shadow-2xl transition-[box-shadow,border-color] duration-150 ${
          isLight
            ? (theme.blur ? 'glass-panel-light text-slate-900' : 'bg-white text-slate-900')
            : (theme.blur ? 'glass-panel text-white' : 'bg-[#161b26] text-white')
        } border ${
          win.isFocused
            ? 'border-cyan-500/60 shadow-cyan-500/10'
            : isLight
            ? 'border-slate-300/80 shadow-md'
            : 'border-gray-700/60 shadow-black/50'
        }`}
      >
      {/* Window Titlebar */}
      <div
        onMouseDown={handleTitlebarMouseDown}
        onDoubleClick={() => maximizeWindow(win.id)}
        className={`h-9 px-3 flex items-center justify-between select-none cursor-move border-b ${
          isLight
            ? (win.isFocused ? 'bg-slate-200/90 border-slate-300 text-slate-800' : 'bg-slate-100/70 border-slate-200 text-slate-500')
            : (win.isFocused ? 'bg-[#1f293d]/80 border-gray-700/80 text-gray-200' : 'bg-[#161f2e]/60 border-gray-800 text-gray-400')
        }`}
      >
        {/* Left: Icon & Title */}
        <div className="flex items-center gap-2 truncate">
          {getAppIcon(win.icon)}
          <span className={`text-xs font-semibold truncate ${isLight ? 'text-slate-800' : 'text-gray-200'}`}>{win.title}</span>
          <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-gray-400'}`}>[{win.pid}]</span>
        </div>

        {/* Right: Window Controls */}
        <div className="flex items-center gap-1.5 ml-2" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => minimizeWindow(win.id)}
            className="w-3.5 h-3.5 rounded-full bg-yellow-500 hover:bg-yellow-400 flex items-center justify-center transition-transform hover:scale-110"
            title="Minimize"
          >
            <Minus className="w-2.5 h-2.5 text-black stroke-[3]" />
          </button>
          <button
            onClick={() => maximizeWindow(win.id)}
            className="w-3.5 h-3.5 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center transition-transform hover:scale-110"
            title="Maximize"
          >
            <Square className="w-2 h-2 text-black fill-black" />
          </button>
          <button
            onClick={() => closeWindow(win.id)}
            className="w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center transition-transform hover:scale-110"
            title="Close"
          >
            <X className="w-2.5 h-2.5 text-black stroke-[3]" />
          </button>
        </div>
      </div>

      {/* Window Client Body */}
      <div className={`flex-1 overflow-hidden relative ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-[#0f141f] text-gray-200'}`}>
        {AppComponent ? (
          <AppErrorBoundary appId={win.appId} windowId={win.id} onClose={handleClose}>
            <AppComponent
              windowId={win.id}
              pid={win.pid}
              initialProps={win.props}
              isFocused={win.isFocused}
              onClose={handleClose}
              setTitle={handleSetTitle}
            />
          </AppErrorBoundary>
        ) : (
          <div className="p-4 text-xs text-red-400">Application component not found.</div>
        )}
      </div>

      {/* Resizing Handles (only in normal state) */}
      {win.state === 'normal' && (
        <>
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
            className="absolute top-0 inset-x-2 h-1.5 cursor-n-resize"
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 's')}
            className="absolute bottom-0 inset-x-2 h-1.5 cursor-s-resize"
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
            className="absolute left-0 inset-y-2 w-1.5 cursor-w-resize"
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
            className="absolute right-0 inset-y-2 w-1.5 cursor-e-resize"
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
            className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize"
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
            className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize"
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
            className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize"
          />
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
            className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
          />
        </>
      )}
    </div>
    </>
  );
};
