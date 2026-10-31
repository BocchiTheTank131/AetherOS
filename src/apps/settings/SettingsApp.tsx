// AetherOS - System Settings Application with Custom Wallpapers & Audio Controls
import React, { useState } from 'react';
import type { AppProps } from '../types';
import { useSystem } from '../../core/context';
import { vfs } from '../../vfs/vfs';
import { virtualKernel } from '../../core/kernel';
import { audioService } from '../../core/audio';
import {
  Palette,
  Monitor,
  HardDrive,
  User,
  Info,
  Check,
  RotateCcw,
  Download,
  Upload,
  Volume2,
  VolumeX,
  Play,
  Image as ImageIcon,
} from 'lucide-react';

const WALLPAPERS = [
  {
    name: 'Cosmic Nebula',
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2560&auto=format&fit=crop',
  },
  {
    name: 'Deep Space',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=2560&auto=format&fit=crop',
  },
  {
    name: 'Aurora Borealis',
    url: 'https://images.unsplash.com/photo-1579033461380-adb47c3eb938?q=80&w=2560&auto=format&fit=crop',
  },
  {
    name: 'Cyberpunk Twilight',
    url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?q=80&w=2560&auto=format&fit=crop',
  },
  {
    name: 'Minimal Dark',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2560&auto=format&fit=crop',
  },
];

const ACCENT_COLORS = [
  { name: 'cyan', hex: '#00f2fe', label: 'Cyan' },
  { name: 'violet', hex: '#8b5cf6', label: 'Violet' },
  { name: 'emerald', hex: '#10b981', label: 'Emerald' },
  { name: 'blue', hex: '#3b82f6', label: 'Blue' },
  { name: 'amber', hex: '#f59e0b', label: 'Amber' },
  { name: 'rose', hex: '#f43f5e', label: 'Rose' },
];

export const SettingsApp: React.FC<AppProps> = () => {
  const { theme, setTheme, user, setUser, rebootSystem } = useSystem();
  const [activeCategory, setActiveCategory] = useState<
    'appearance' | 'dock' | 'sound' | 'storage' | 'users' | 'about'
  >('appearance');
  const [displayNameInput, setDisplayNameInput] = useState(user.displayName);
  const [customWpUrl, setCustomWpUrl] = useState('');
  const [isMuted, setIsMuted] = useState(audioService.isSoundMuted());
  const [volume, setVolumeState] = useState(Math.round(audioService.getVolume() * 100));

  const handleExportBackup = () => {
    const data = vfs.exportSnapshot();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aetheros-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        await vfs.importSnapshot(text);
        alert('System restored from backup! Restarting session...');
        rebootSystem();
      } catch (err) {
        alert(`Failed to restore backup: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleFactoryReset = async () => {
    if (
      confirm(
        'WARNING: Factory Reset will erase all files, configurations, and settings in AetherOS. Continue?'
      )
    ) {
      await vfs.resetFileSystem();
      alert('AetherOS reset complete. Rebooting system now.');
      rebootSystem();
    }
  };

  const handleApplyCustomWpUrl = () => {
    if (!customWpUrl.trim()) return;
    setTheme({ wallpaper: customWpUrl.trim() });
  };

  const handleUploadWallpaperFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const targetPath = `/home/aether/Pictures/${file.name}`;
      try {
        if (!vfs.exists('/home/aether/Pictures')) {
          vfs.mkdir('/home/aether/Pictures');
        }
        vfs.writeFile(targetPath, dataUrl, { isBinary: true });
      } catch {
        // Ignore
      }
      setTheme({ wallpaper: targetPath });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleToggleMute = () => {
    const muted = audioService.toggleMute();
    setIsMuted(muted);
  };

  const handleVolumeChange = (newVal: number) => {
    setVolumeState(newVal);
    audioService.setVolume(newVal / 100);
  };

  const handleTestSound = () => {
    audioService.playNotification();
  };

  return (
    <div className="flex h-full bg-[#111827] text-gray-200 select-none overflow-hidden">
      {/* Category Sidebar */}
      <div className="w-52 bg-[#161f2e] border-r border-gray-700/60 p-3 flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-3 py-1">
          Settings
        </span>

        <button
          onClick={() => setActiveCategory('appearance')}
          className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
            activeCategory === 'appearance'
              ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
              : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          <Palette className="w-4 h-4 text-cyan-400" />
          <span>Appearance</span>
        </button>

        <button
          onClick={() => setActiveCategory('dock')}
          className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
            activeCategory === 'dock'
              ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
              : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          <Monitor className="w-4 h-4 text-blue-400" />
          <span>Dock & Panels</span>
        </button>

        <button
          onClick={() => setActiveCategory('sound')}
          className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
            activeCategory === 'sound'
              ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
              : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          <Volume2 className="w-4 h-4 text-emerald-400" />
          <span>Sound & Audio</span>
        </button>

        <button
          onClick={() => setActiveCategory('storage')}
          className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
            activeCategory === 'storage'
              ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
              : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          <HardDrive className="w-4 h-4 text-amber-400" />
          <span>Storage & Backup</span>
        </button>

        <button
          onClick={() => setActiveCategory('users')}
          className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
            activeCategory === 'users'
              ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
              : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          <User className="w-4 h-4 text-purple-400" />
          <span>User Accounts</span>
        </button>

        <button
          onClick={() => setActiveCategory('about')}
          className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
            activeCategory === 'about'
              ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
              : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          <Info className="w-4 h-4 text-pink-400" />
          <span>About AetherOS</span>
        </button>
      </div>

      {/* Settings Content Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* APPEARANCE */}
        {activeCategory === 'appearance' && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Appearance</h2>
              <p className="text-xs text-gray-400">Personalize your desktop theme and wallpapers.</p>
            </div>

            {/* Dark / Light Mode */}
            <div className="bg-[#1e293b] p-4 rounded-xl border border-gray-700/60 space-y-3">
              <label className="text-sm font-semibold text-white">System Theme</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTheme({ mode: 'dark' })}
                  className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                    theme.mode === 'dark'
                      ? 'border-cyan-500 bg-cyan-500/10 text-white'
                      : 'border-gray-700 bg-gray-800 text-gray-400'
                  }`}
                >
                  <span className="text-sm font-medium">Dark Mode</span>
                  {theme.mode === 'dark' && <Check className="w-4 h-4 text-cyan-400" />}
                </button>
                <button
                  onClick={() => setTheme({ mode: 'light' })}
                  className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                    theme.mode === 'light'
                      ? 'border-cyan-500 bg-cyan-500/10 text-white'
                      : 'border-gray-700 bg-gray-800 text-gray-400'
                  }`}
                >
                  <span className="text-sm font-medium">Light Mode</span>
                  {theme.mode === 'light' && <Check className="w-4 h-4 text-cyan-400" />}
                </button>
              </div>
            </div>

            {/* Accent Colors */}
            <div className="bg-[#1e293b] p-4 rounded-xl border border-gray-700/60 space-y-3">
              <label className="text-sm font-semibold text-white">Accent Color</label>
              <div className="flex items-center gap-3">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setTheme({ accentColor: c.name, accentHex: c.hex })}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 shadow"
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                  >
                    {theme.accentColor === c.name && <Check className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Wallpapers */}
            <div className="bg-[#1e293b] p-4 rounded-xl border border-gray-700/60 space-y-3">
              <label className="text-sm font-semibold text-white">Desktop Wallpaper</label>
              <div className="grid grid-cols-3 gap-3">
                {WALLPAPERS.map((wp) => (
                  <div
                    key={wp.url}
                    onClick={() => setTheme({ wallpaper: wp.url })}
                    className={`relative rounded-lg overflow-hidden h-24 border cursor-pointer group ${
                      theme.wallpaper === wp.url ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-gray-700'
                    }`}
                  >
                    <img
                      src={wp.url}
                      alt={wp.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] text-white font-medium truncate">
                      {wp.name}
                    </div>
                  </div>
                ))}
              </div>

              {/* Custom Wallpaper Section */}
              <div className="pt-2 border-t border-gray-700/60 space-y-2">
                <span className="text-xs text-gray-300 font-medium">Custom Wallpaper</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://example.com/wallpaper.jpg"
                    value={customWpUrl}
                    onChange={(e) => setCustomWpUrl(e.target.value)}
                    className="flex-1 bg-[#111827] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleApplyCustomWpUrl}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
                  >
                    Apply URL
                  </button>
                  <label className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium cursor-pointer flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadWallpaperFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Transparency & Blur */}
            <div className="bg-[#1e293b] p-4 rounded-xl border border-gray-700/60 space-y-3">
              <label className="text-sm font-semibold text-white">Effects</label>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300">Glassmorphism Blur & Transparency</span>
                <input
                  type="checkbox"
                  checked={theme.blur}
                  onChange={(e) => setTheme({ blur: e.target.checked, transparency: e.target.checked })}
                  className="rounded text-cyan-500 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* DOCK & PANELS */}
        {activeCategory === 'dock' && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Dock & Panels</h2>
              <p className="text-xs text-gray-400">Configure taskbar position and dock behavior.</p>
            </div>

            <div className="bg-[#1e293b] p-4 rounded-xl border border-gray-700/60 space-y-3">
              <label className="text-sm font-semibold text-white">Dock Screen Position</label>
              <div className="grid grid-cols-3 gap-3">
                {(['bottom', 'top', 'left'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setTheme({ dockPosition: pos })}
                    className={`p-3 rounded-lg border text-center capitalize text-xs font-semibold transition-colors ${
                      theme.dockPosition === pos
                        ? 'border-cyan-400 bg-cyan-500/10 text-white'
                        : 'border-gray-700 bg-gray-800 text-gray-400'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SOUND & AUDIO */}
        {activeCategory === 'sound' && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Sound & Audio</h2>
              <p className="text-xs text-gray-400">Synthesizer volume and system sound effects.</p>
            </div>

            <div className="bg-[#1e293b] p-4 rounded-xl border border-gray-700/60 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-white block">System Sound Effects</span>
                  <span className="text-xs text-gray-400">Boot chime, window snapping, alerts</span>
                </div>
                <button
                  onClick={handleToggleMute}
                  className={`p-2 rounded-lg border flex items-center gap-1.5 text-xs font-semibold ${
                    !isMuted
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-gray-700 bg-gray-800 text-gray-400'
                  }`}
                >
                  {!isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  <span>{!isMuted ? 'Enabled' : 'Muted'}</span>
                </button>
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-700/60">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-300">Master Volume</span>
                  <span className="font-mono text-cyan-400">{volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleTestSound}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium"
                >
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Test Notification Tone</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STORAGE & BACKUP */}
        {activeCategory === 'storage' && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Storage & System Backup</h2>
              <p className="text-xs text-gray-400">
                Manage IndexedDB persistent storage, export snapshots, and restore.
              </p>
            </div>

            <div className="bg-[#1e293b] p-4 rounded-xl border border-gray-700/60 space-y-3">
              <label className="text-sm font-semibold text-white">Filesystem Capacity</label>
              <div className="space-y-2 text-xs text-gray-300">
                <div className="flex justify-between">
                  <span>Total Filesystem Nodes:</span>
                  <span className="font-mono text-cyan-400">{vfs.getAllNodes().length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Storage Backend:</span>
                  <span className="font-mono text-emerald-400">IndexedDB (Browser Persistent)</span>
                </div>
              </div>
            </div>

            <div className="bg-[#1e293b] p-4 rounded-xl border border-gray-700/60 space-y-3">
              <label className="text-sm font-semibold text-white">System Backup & Restore</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportBackup}
                  className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium"
                >
                  <Download className="w-4 h-4" />
                  <span>Export System Backup</span>
                </button>
                <label className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs font-medium cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Restore from Backup</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl space-y-2">
              <h3 className="text-sm font-bold text-red-400">Factory Reset</h3>
              <p className="text-xs text-gray-300">
                Resets the virtual filesystem, wiping all personal files and restoring the default Linux skeleton.
              </p>
              <button
                onClick={handleFactoryReset}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold mt-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Erase All Data & Reset</span>
              </button>
            </div>
          </div>
        )}

        {/* USERS */}
        {activeCategory === 'users' && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">User Accounts</h2>
              <p className="text-xs text-gray-400">Manage user profile information and permissions.</p>
            </div>

            <div className="bg-[#1e293b] p-4 rounded-xl border border-gray-700/60 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 font-bold text-xl">
                  {user.displayName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-white">{user.displayName}</h3>
                  <p className="text-xs text-gray-400">
                    @{user.username} &bull; <span className="text-cyan-400 uppercase">{user.role}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-gray-700/60">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    className="w-full bg-[#111827] border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  onClick={() => setUser({ displayName: displayNameInput })}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABOUT */}
        {activeCategory === 'about' && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">About AetherOS</h2>
              <p className="text-xs text-gray-400">High-fidelity web-standard virtual operating system.</p>
            </div>

            <div className="bg-[#1e293b] p-4 rounded-xl border border-gray-700/60 space-y-3 text-xs text-gray-300">
              <div className="flex justify-between py-1 border-b border-gray-700/60">
                <span>OS Name:</span>
                <span className="font-semibold text-white">AetherOS Linux</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-700/60">
                <span>Version:</span>
                <span className="font-mono text-cyan-400">1.1.0 (Rolling Release)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-700/60">
                <span>Kernel:</span>
                <span className="font-mono text-cyan-400">{virtualKernel.getKernelVersion()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-700/60">
                <span>Architecture:</span>
                <span className="font-mono text-white">x86_64-browser-wasm</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-700/60">
                <span>Window Manager:</span>
                <span className="font-mono text-white">AetherWM v1.1 Compositor</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-700/60">
                <span>Default Shell:</span>
                <span className="font-mono text-white">aesh (Aether Shell)</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Storage Engine:</span>
                <span className="font-mono text-emerald-400">Browser IndexedDB Engine</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
