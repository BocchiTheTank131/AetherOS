// AetherOS - Main Operating System Application Root
import React, { useState } from 'react';
import { SystemProvider, useSystem } from './core/context';
import { BootScreen } from './desktop/components/BootScreen';
import { LockScreen } from './desktop/components/LockScreen';
import { Desktop } from './desktop/components/Desktop';
import { Taskbar } from './desktop/components/Taskbar';
import { AppLauncher } from './desktop/components/AppLauncher';
import { CommandPalette } from './desktop/components/CommandPalette';
import { NotificationCenter } from './desktop/components/NotificationCenter';
import { QuickSettings } from './desktop/components/QuickSettings';
import { Power } from 'lucide-react';

const AetherOSDesktop: React.FC = () => {
  const { booted, isPoweredOff, powerOnSystem } = useSystem();
  const [bootCompleted, setBootCompleted] = useState(false);

  if (isPoweredOff) {
    return (
      <div className="fixed inset-0 bg-[#070a10] text-gray-300 flex flex-col items-center justify-center p-6 select-none font-sans">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4 shadow-xl">
          <Power className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">System is powered down</h1>
        <p className="text-xs text-gray-400 mb-6">AetherCore kernel and services halted safely.</p>
        <button
          onClick={() => {
            setBootCompleted(false);
            powerOnSystem();
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold text-xs rounded-xl shadow-lg hover:opacity-90 active:scale-95 transition-all"
        >
          <Power className="w-4 h-4" />
          <span>Power On AetherOS</span>
        </button>
      </div>
    );
  }

  if (!bootCompleted || !booted) {
    return <BootScreen onComplete={() => setBootCompleted(true)} />;
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0d14] text-white">
      {/* Desktop Surface with Workspace Windows */}
      <Desktop />

      {/* Dock / Taskbar */}
      <Taskbar />

      {/* Start Menu App Launcher */}
      <AppLauncher />

      {/* Quick Runner / Command Palette (Alt+Space) */}
      <CommandPalette />

      {/* Notification Toasts & Center */}
      <NotificationCenter />

      {/* Quick Settings System Tray */}
      <QuickSettings />

      {/* Lock Screen */}
      <LockScreen />
    </div>
  );
};

export default function App() {
  return (
    <SystemProvider>
      <AetherOSDesktop />
    </SystemProvider>
  );
}
