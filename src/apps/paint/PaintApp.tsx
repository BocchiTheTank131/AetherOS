// AetherOS - Paint Studio Application
import React, { useState, useRef, useEffect } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { useSystem } from '../../core/context';
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
  const [isDrawing, setIsDrawing] = useState(false);
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

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.beginPath();
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing && e.type !== 'mousedown') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineWidth = tool === 'eraser' ? brushSize * 4 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;

    ctx.lineTo(x, y);
    ctx.stroke();
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
      alert(`Save error: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#181a24] text-gray-200 select-none overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-2 bg-[#202434] border-b border-gray-700/60 text-xs">
        {/* Tools */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTool('brush')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'brush' ? 'bg-cyan-500/20 text-cyan-400 font-semibold' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Brush"
          >
            <Paintbrush className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'eraser' ? 'bg-cyan-500/20 text-cyan-400 font-semibold' : 'text-gray-300 hover:bg-gray-700'
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
                onClick={() => setBrushSize(sz)}
                className={`w-6 h-6 rounded flex items-center justify-center ${
                  brushSize === sz ? 'bg-cyan-600 text-white' : 'hover:bg-gray-700 text-gray-400'
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
              onClick={() => {
                setColor(c);
                setTool('brush');
              }}
              style={{ backgroundColor: c }}
              className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                color === c && tool === 'brush' ? 'ring-2 ring-cyan-400 border-white' : 'border-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-gray-700 text-gray-300 hover:text-white rounded"
            title="Clear Canvas"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleSaveToVfs}
            className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save to Pictures</span>
          </button>
        </div>
      </div>

      {/* Drawing Canvas Area */}
      <div className="flex-1 flex items-center justify-center p-3 bg-[#11131c] overflow-auto">
        <canvas
          ref={canvasRef}
          width={640}
          height={400}
          onMouseDown={startDrawing}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onMouseMove={draw}
          className="bg-white rounded-xl shadow-2xl cursor-crosshair border border-gray-700"
        />
      </div>
    </div>
  );
};
