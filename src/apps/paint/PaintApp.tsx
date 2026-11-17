// AetherOS - Paint Studio Application
import React, { useState, useRef, useEffect } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { useSystem } from '../../core/context';
import { dialogService } from '../../core/dialog';
import {
  Paintbrush,
  Eraser,
  Save,
  RotateCcw,
  Circle,
} from 'lucide-react';

const COLORS = [
  '#ffffff',
  '#00f2fe',
  '#4facfe',
  '#38ef7d',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#000000',
];

export const PaintApp: React.FC<AppProps> = () => {
  const { addNotification } = useSystem();
  const [color, setColor] = useState('#00f2fe');
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const drawingPointer = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill white background initially
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    drawingPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    draw(event);
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerId !== drawingPointer.current) return;
    drawingPointer.current = null;
    event.currentTarget.getContext('2d')?.beginPath();
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== drawingPointer.current) return;
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.lineWidth = tool === 'eraser' ? brushSize * 4 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;

    if (e.type === 'pointerdown') {
      ctx.beginPath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.arc(x, y, ctx.lineWidth / 2, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleSaveToVfs = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const filename = `sketch-${Date.now().toString().slice(-4)}.png`;
    const targetPath = `/home/aether/Pictures/${filename}`;

    try {
      vfs.writeFile(targetPath, dataUrl, { isBinary: true });
      addNotification({
        title: 'Paint Studio',
        message: `Saved artwork to ${targetPath}`,
        level: 'success',
      });
    } catch (err) {
      dialogService.alert({
        title: 'Save Failed',
        message: `Failed to save artwork: ${(err as Error).message}`,
        level: 'error',
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas text-ink select-none overflow-hidden">
      {/* Top Toolbar */}
      <div className="app-toolbar flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Tools */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTool('brush')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'brush' ? 'bg-selection text-accent font-semibold' : 'text-secondary hover:bg-hover'
            }`}
            title="Brush"
          >
            <Paintbrush className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'eraser' ? 'bg-selection text-accent font-semibold' : 'text-secondary hover:bg-hover'
            }`}
            title="Eraser"
          >
            <Eraser className="w-4 h-4" />
          </button>

          {/* Size */}
          <div className="flex items-center gap-1 ml-2">
            {[2, 4, 8, 14].map((sz) => (
              <button
                key={sz}
                aria-label={`Brush size ${sz}`}
                aria-pressed={brushSize === sz}
                onClick={() => setBrushSize(sz)}
                className={`w-6 h-6 rounded flex items-center justify-center ${
                  brushSize === sz ? 'bg-action text-on-action' : 'hover:bg-hover text-muted'
                }`}
              >
                <Circle style={{ width: sz + 2, height: sz + 2 }} className="fill-current" />
              </button>
            ))}
          </div>
        </div>

        {/* Color Palette */}
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Paint color ${c}`}
              aria-pressed={color === c && tool === 'brush'}
              onClick={() => {
                setColor(c);
                setTool('brush');
              }}
              style={{ backgroundColor: c }}
              className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                color === c && tool === 'brush' ? 'ring-2 ring-accent border-white' : 'border-line'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-hover text-secondary hover:text-ink rounded"
            title="Clear Canvas"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleSaveToVfs}
            className="flex items-center gap-1 px-2.5 py-1 bg-action hover:bg-action text-on-action rounded text-xs font-semibold"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save to Pictures</span>
          </button>
        </div>
      </div>

      {/* Drawing Canvas Area */}
      <div className="paint-workspace">
        <canvas
          ref={canvasRef}
          width={640}
          height={400}
          onPointerDown={startDrawing}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onLostPointerCapture={stopDrawing}
          onPointerMove={draw}
          className="paint-canvas"
        />
      </div>
    </div>
  );
};
