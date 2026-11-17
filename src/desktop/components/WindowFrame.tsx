import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import type { WindowInstance } from '../types';
import { useSystem } from '../../core/context';
import { appRegistry } from '../../apps/appRegistry';
import { AppErrorBoundary } from './AppErrorBoundary';
import { AppIcon } from './AppIcon';

type Direction = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type Snap = 'left' | 'right' | 'top';
const handles: Direction[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

interface Gesture {
  pointer: number;
  type: 'drag' | Direction;
  x: number;
  y: number;
  bounds: DOMRect;
  frame: DOMRect;
  moved: boolean;
  snap: Snap | null;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function WindowFrame({ window: win }: { window: WindowInstance }) {
  const {
    closeWindow, focusWindow, minimizeWindow, maximizeWindow, snapWindow,
    updateWindowPosition, updateWindowSize, updateWindowTitle, theme,
  } = useSystem();
  const [gestureType, setGestureType] = useState<Gesture['type'] | null>(null);
  const [preview, setPreview] = useState<Snap | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const app = appRegistry.get(win.appId);
  const App = app?.component;
  const minimized = win.state === 'minimized';

  const handleClose = useCallback(() => closeWindow(win.id, async () => {
    const frame = frameRef.current;
    if (!frame?.offsetParent || theme.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    await frame.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: .98 }], {
      duration: 140, easing: 'ease-out', fill: 'forwards',
    }).finished.catch(() => {});
  }), [closeWindow, theme.reducedMotion, win.id]);

  const handleSetTitle = useCallback((title: string) => updateWindowTitle(win.id, title), [win.id, updateWindowTitle]);

  const beginGesture = (event: React.PointerEvent<HTMLElement>, type: Gesture['type']) => {
    const frame = frameRef.current;
    if (event.button !== 0 || !event.isPrimary || !frame?.offsetParent) return;
    event.stopPropagation();
    focusWindow(win.id);
    const bounds = frame.offsetParent.getBoundingClientRect();
    gesture.current = {
      pointer: event.pointerId, type, bounds, frame: frame.getBoundingClientRect(),
      x: event.clientX, y: event.clientY, moved: false, snap: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveGesture = (event: React.PointerEvent) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    const { bounds, frame, type } = active;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (!active.moved && Math.hypot(dx, dy) < 4) return;
    active.moved = true;
    setGestureType(type);

    if (type === 'drag') {
      const width = Math.min(win.width, bounds.width);
      const height = Math.min(win.height, bounds.height);
      const anchoredX = frame.width === width ? frame.left + dx
        : event.clientX - width * clamp((active.x - frame.left) / frame.width, 0, 1);
      const x = clamp(anchoredX, bounds.left, bounds.right - width);
      const y = clamp(frame.top + dy, bounds.top, bounds.bottom - height);
      updateWindowPosition(win.id, x, y);
      active.snap = event.clientY <= bounds.top + 12 ? 'top'
        : event.clientX <= bounds.left + 12 ? 'left'
        : event.clientX >= bounds.right - 12 ? 'right' : null;
      setPreview(active.snap);
      return;
    }

    const minW = Math.min(win.minWidth, bounds.width);
    const minH = Math.min(win.minHeight, bounds.height);
    const left = type.includes('w') ? clamp(frame.left + dx, bounds.left, frame.right - minW) : frame.left;
    const top = type.includes('n') ? clamp(frame.top + dy, bounds.top, frame.bottom - minH) : frame.top;
    const right = type.includes('e') ? clamp(frame.right + dx, frame.left + minW, bounds.right) : frame.right;
    const bottom = type.includes('s') ? clamp(frame.bottom + dy, frame.top + minH, bounds.bottom) : frame.bottom;
    updateWindowSize(win.id, right - left, bottom - top, left, top);
  };

  const endGesture = (event: React.PointerEvent) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (event.type === 'pointerup' && active.snap) snapWindow(win.id, active.snap);
    gesture.current = null;
    setGestureType(null);
    setPreview(null);
  };

  const tiled = win.state === 'maximized' || win.state === 'snapped-left' || win.state === 'snapped-right';
  const width = `min(${win.width}px, 100%)`;
  const height = `min(${win.height}px, 100%)`;
  const style: React.CSSProperties = tiled ? { zIndex: win.zIndex } : {
    width,
    height,
    left: `clamp(0px, calc(${win.x}px - var(--work-left)), calc(100% - ${width}))`,
    top: `clamp(0px, calc(${win.y}px - var(--work-top)), calc(100% - ${height}))`,
    zIndex: win.zIndex,
  };

  return (
    <>
      {gestureType && createPortal(<div className="window-pointer-mask" data-direction={gestureType} />, document.body)}
      {preview && <div className="snap-preview" data-snap={preview} aria-hidden="true" />}
      <div
        ref={frameRef}
        className="window-frame"
        data-app={win.appId}
        data-state={win.state}
        data-focused={win.isFocused}
        data-interacting={gestureType !== null}
        style={style}
        inert={minimized}
        onPointerDown={() => { if (!win.isFocused) focusWindow(win.id); }}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <header className="window-titlebar glass-navigation" onPointerDown={(event) => beginGesture(event, 'drag')} onDoubleClick={() => maximizeWindow(win.id)}>
          <div className="window-title"><AppIcon name={win.icon} size={16} /><span>{win.title}</span></div>
          <div className="window-controls" onPointerDown={(event) => {
            event.stopPropagation();
            if (!win.isFocused) focusWindow(win.id);
          }} onDoubleClick={(event) => event.stopPropagation()}>
            <button title="Minimize" aria-label="Minimize" onClick={() => minimizeWindow(win.id)}><Minus size={16} /></button>
            <button title={win.state === 'maximized' ? 'Restore' : 'Maximize'} onClick={() => maximizeWindow(win.id)}>
              {win.state === 'maximized' ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button title="Close" aria-label="Close" onClick={handleClose}><X size={17} /></button>
          </div>
        </header>
        <div className="window-client">
          {App ? (
            <AppErrorBoundary appId={win.appId} windowId={win.id} onClose={handleClose}>
              <React.Suspense fallback={<div className="p-5 text-sm text-muted">Loading application…</div>}>
                <App windowId={win.id} pid={win.pid} initialProps={win.props} isFocused={win.isFocused} onClose={handleClose} setTitle={handleSetTitle} />
              </React.Suspense>
            </AppErrorBoundary>
          ) : <div className="p-5 text-sm text-danger">Application component not found.</div>}
        </div>
        {win.state === 'normal' && handles.map((direction) => (
          <div key={direction} className="window-resize" data-direction={direction} onPointerDown={(event) => beginGesture(event, direction)} />
        ))}
      </div>
    </>
  );
}
