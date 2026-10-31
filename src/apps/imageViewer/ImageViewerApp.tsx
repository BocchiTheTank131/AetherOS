// AetherOS - Image Viewer Application
import React, { useState, useEffect } from 'react';
import type { AppProps } from '../types';
import { vfs } from '../../vfs/vfs';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Image as ImageIcon } from 'lucide-react';

export const ImageViewerApp: React.FC<AppProps> = ({ initialProps, setTitle }) => {
  const filePath =
    (initialProps?.filePath as string) || '/home/aether/Pictures/aether_constellation.svg';
  const [imageSrc, setImageSrc] = useState<string>('');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    let objectUrlToRevoke: string | null = null;
    if (vfs.exists(filePath)) {
      try {
        const content = vfs.readFile(filePath);
        if (content.startsWith('data:image')) {
          setImageSrc(content);
        } else if (filePath.endsWith('.svg')) {
          const blob = new Blob([content], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          objectUrlToRevoke = url;
          setImageSrc(url);
        } else {
          const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
          const mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          const blob = new Blob([content], { type: mime });
          const url = URL.createObjectURL(blob);
          objectUrlToRevoke = url;
          setImageSrc(url);
        }
        if (setTitle) setTitle(`${filePath.split('/').pop()} - Image Viewer`);
      } catch {}
    }

    return () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [filePath, setTitle]);

  return (
    <div className="flex flex-col h-full bg-[#0d0f17] text-white select-none overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-2 bg-[#161a26] border-b border-gray-800 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-gray-300">
          <ImageIcon className="w-4 h-4 text-cyan-400" />
          <span className="truncate max-w-[200px]">{filePath.split('/').pop()}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="p-1.5 hover:bg-gray-700/60 rounded"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4 text-gray-300" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            className="p-1.5 hover:bg-gray-700/60 rounded"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4 text-gray-300" />
          </button>
          <button
            onClick={() => setRotation((r) => (r - 90) % 360)}
            className="p-1.5 hover:bg-gray-700/60 rounded"
            title="Rotate Left"
          >
            <RotateCcw className="w-4 h-4 text-gray-300" />
          </button>
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 hover:bg-gray-700/60 rounded"
            title="Rotate Right"
          >
            <RotateCw className="w-4 h-4 text-gray-300" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setRotation(0);
            }}
            className="p-1.5 hover:bg-gray-700/60 rounded text-xs font-semibold px-2"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Main Image Display */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-[radial-gradient(#1e2433_1px,transparent_1px)] [background-size:16px_16px]">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt="Viewer"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.15s ease-out',
            }}
            className="max-h-[85%] max-w-[85%] object-contain rounded-lg shadow-2xl drop-shadow"
          />
        ) : (
          <div className="text-gray-500 text-xs">No image loaded</div>
        )}
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#121520] border-t border-gray-800 text-[11px] text-gray-400">
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span>Rotation: {rotation}°</span>
      </div>
    </div>
  );
};
