// AetherOS - Quick Settings Tray Popover Component
import React, { useState } from 'react';
import { useSystem } from '../../core/context';
import { audioService } from '../../core/audio';
import {
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Wifi,
  Sparkles,
  Lock,
  RotateCcw,
  Power,
  Shield,
} from 'lucide-react';

export const QuickSettings: React.FC = () => {
  const {
    quickSettingsOpen,
    setQuickSettingsOpen,
    theme,
    setTheme,
    setIsLocked,
    rebootSystem,
    shutdownSystem,
  } = useSystem();

  const [volume, setVolume] = useState(audioService.getVolume());
  const [isMuted, setIsMuted] = useState(audioService.isSoundMuted());

  if (!quickSettingsOpen) return null;

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    setIsMuted(false);
    audioService.setVolume(v);
  };

  const handleMuteToggle = () => {
    const muted = audioService.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`fixed right-4 ${
        theme.dockPosition === 'top' ? 'top-14' : 'bottom-14'
      } z-[9995] w-72 select-none rounded-2xl border border-gray-700/80 shadow-2xl p-4 flex flex-col gap-4 ${
        theme.blur ? 'glass-panel' : 'bg-[#141926]'
      }`}
    >
      <div className="flex items-center justify-between border-b border-gray-700/60 pb-2 text-xs font-semibold text-white">
        <span>Quick Settings</span>
        <span className="text-cyan-400 font-mono text-[11px]">AetherOS 1.0</span>
      </div>

      {/* Quick Action Tiles */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Dark / Light Toggle */}
        <button
          onClick={() => setTheme({ mode: theme.mode === 'dark' ? 'light' : 'dark' })}
          className={`p-2.5 rounded-xl border flex items-center gap-2 transition-colors ${
            theme.mode === 'dark'
              ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
              : 'bg-gray-800 border-gray-700 text-gray-300'
          }`}
        >
          {theme.mode === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          <span className="font-semibold">{theme.mode === 'dark' ? 'Dark' : 'Light'}</span>
        </button>

        {/* Wi-Fi Status */}
        <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 flex items-center gap-2">
          <Wifi className="w-4 h-4" />
          <span className="font-semibold truncate">Connected</span>
        </div>

        {/* Glassmorphism Toggle */}
        <button
          onClick={() => setTheme({ blur: !theme.blur })}
          className={`p-2.5 rounded-xl border flex items-center gap-2 transition-colors ${
            theme.blur
              ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
              : 'bg-gray-800 border-gray-700 text-gray-400'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span className="font-semibold">Glass Blur</span>
        </button>

        {/* Security Shield */}
        <div className="p-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300 flex items-center gap-2">
          <Shield className="w-4 h-4" />
          <span className="font-semibold truncate">Sandbox OK</span>
        </div>
      </div>

      {/* Volume Slider */}
      <div className="space-y-1.5 bg-[#101420]/60 p-2.5 rounded-xl border border-gray-700/50">
        <div className="flex items-center justify-between text-xs text-gray-300">
          <button onClick={handleMuteToggle} className="hover:text-white">
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <span className="font-mono text-[11px]">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={isMuted ? 0 : volume}
          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          className="w-full accent-cyan-400 h-1.5 bg-gray-700 rounded-lg cursor-pointer"
        />
      </div>

      {/* Power Action Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-700/60">
        <button
          onClick={() => {
            setIsLocked(true);
            setQuickSettingsOpen(false);
          }}
          className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center justify-center"
          title="Lock Session"
        >
          <Lock className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            rebootSystem();
            setQuickSettingsOpen(false);
          }}
          className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center justify-center"
          title="Restart System"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            shutdownSystem();
            setQuickSettingsOpen(false);
          }}
          className="p-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 flex items-center justify-center"
          title="Power Off"
        >
          <Power className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
