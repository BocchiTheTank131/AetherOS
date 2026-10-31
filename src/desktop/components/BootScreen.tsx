// AetherOS - Realistic Animated Boot Screen & Systemd Startup Logs
import React, { useState, useEffect } from 'react';
import { Terminal } from 'lucide-react';

interface BootScreenProps {
  onComplete: () => void;
}

const BOOT_STEPS = [
  'AetherCore Kernel version 6.8.0-aether loading...',
  'Checking virtual filesystem integrity (fsck.ext4)... clean',
  'Mounting persistent IndexedDB virtual filesystem on /...',
  'Mounting virtual pseudo-filesystem /proc...',
  'Creating device nodes in /dev (null, zero, urandom)...',
  'Starting systemd-journald system logger...',
  'Starting aether-sound.service (Web Audio API Synthesizer)...',
  'Loading aetherpkg package repository database...',
  'Setting hostname to aetheros...',
  'Initializing user session for aether (UID: 1000)...',
  'Starting Aether Desktop Compositor...',
  'Reached target Graphical Desktop Interface.',
];

export const BootScreen: React.FC<BootScreenProps> = ({ onComplete }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    let currentIdx = 0;
    const interval = setInterval(() => {
      if (currentIdx < BOOT_STEPS.length) {
        setLogs((prev) => [...prev, BOOT_STEPS[currentIdx]]);
        setProgress(Math.round(((currentIdx + 1) / BOOT_STEPS.length) * 100));
        currentIdx++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          onComplete();
        }, 600);
      }
    }, 180);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[99999] bg-[#090d16] text-white flex flex-col items-center justify-center p-6 select-none font-sans">
      {/* Center Branding */}
      <div className="flex flex-col items-center max-w-sm w-full">
        {/* Animated Glowing Logo */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30 animate-pulse">
            <div className="w-9 h-9 border-4 border-white rounded-lg rotate-45 flex items-center justify-center">
              <div className="w-3 h-3 bg-white rounded-full" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-300 to-purple-400 mb-1">
          AETHER<span className="font-light text-white">OS</span>
        </h1>
        <p className="text-xs text-gray-400 tracking-widest uppercase mb-8 font-mono">
          Linux-Inspired Browser Environment
        </p>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <button
          onClick={() => setShowLogs((prev) => !prev)}
          className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-cyan-400 transition-colors"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>{showLogs ? 'Hide Boot Console' : 'Show Boot Console'}</span>
        </button>
      </div>

      {/* Detailed Systemd Boot Log Console */}
      {showLogs && (
        <div className="absolute inset-x-8 bottom-8 max-h-48 overflow-y-auto bg-black/80 border border-gray-800 rounded-xl p-3 font-mono text-[11px] text-gray-300 space-y-1 select-text">
          {logs.map((log, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">[  OK  ]</span>
              <span>{log}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
