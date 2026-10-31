// AetherOS - Lock Screen Component
import React, { useState, useEffect, useMemo } from 'react';
import { useSystem } from '../../core/context';
import { audioService } from '../../core/audio';
import { vfs } from '../../vfs/vfs';
import { ArrowRight, User } from 'lucide-react';

export const LockScreen: React.FC = () => {
  const { isLocked, setIsLocked, user, theme } = useSystem();
  const [password, setPassword] = useState('');
  const [time, setTime] = useState(() => new Date());

  const resolvedWallpaper = useMemo(() => {
    if (theme.wallpaper.startsWith('/')) {
      try {
        if (vfs.exists(theme.wallpaper)) {
          return vfs.readFile(theme.wallpaper);
        }
      } catch {
        // Fallback
      }
    }
    return theme.wallpaper;
  }, [theme.wallpaper]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isLocked) return null;

  const handleUnlock = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLocked(false);
    setPassword('');
    audioService.playClick();
  };

  return (
    <div
      style={{
        backgroundImage: `url(${resolvedWallpaper})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-between p-12 select-none text-white backdrop-blur-xl"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      {/* Clock at Top */}
      <div className="relative z-10 flex flex-col items-center mt-12">
        <h1 className="text-7xl font-extralight tracking-tight font-sans">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </h1>
        <p className="text-lg text-gray-300 font-medium mt-2">
          {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Center Unlock Box */}
      <div className="relative z-10 w-full max-w-xs flex flex-col items-center mb-16">
        <div className="w-20 h-20 rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 shadow-2xl mb-4">
          <User className="w-10 h-10" />
        </div>
        <h2 className="text-base font-bold text-white mb-4">{user.displayName}</h2>

        <form onSubmit={handleUnlock} className="w-full flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="password"
              placeholder="Enter password or press Unlock..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-400 outline-none focus:border-cyan-400 backdrop-blur-sm"
            />
          </div>
          <button
            type="submit"
            className="p-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl shadow-lg transition-transform hover:scale-105"
            title="Unlock"
          >
            <ArrowRight className="w-5 h-5 stroke-[2.5]" />
          </button>
        </form>
      </div>

      {/* Footer Branding */}
      <div className="relative z-10 text-xs text-gray-400 font-mono">
        AetherOS 1.0 LTS • AetherCore Virtual Environment
      </div>
    </div>
  );
};
