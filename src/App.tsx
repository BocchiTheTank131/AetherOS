// AetherOS - Main Operating System Application Root
import React, { useState, useEffect, useCallback } from 'react';
import { useSystem } from './core/context';
import { SystemProvider } from './core/SystemProvider';
import { systemEventBus } from './core/eventBus';
import { BootScreen } from './desktop/components/BootScreen';
import { LockScreen } from './desktop/components/LockScreen';
import { Desktop } from './desktop/components/Desktop';
import { Taskbar } from './desktop/components/Taskbar';
import { AppLauncher } from './desktop/components/AppLauncher';
import { CommandPalette } from './desktop/components/CommandPalette';
import { NotificationCenter } from './desktop/components/NotificationCenter';
import { QuickSettings } from './desktop/components/QuickSettings';
import { DialogHost } from './desktop/components/DialogHost';
import { OfflineUpdate } from './core/OfflineUpdate';
import { Power } from 'lucide-react';

const AetherOSDesktop: React.FC = () => {
  const { booted, isLocked, isPoweredOff, powerOnSystem } = useSystem();
  const [bootCompleted, setBootCompleted] = useState(false);
  const finishBoot = useCallback(() => setBootCompleted(true), []);

  useEffect(() => {
    return systemEventBus.on('system:stopping', () => setBootCompleted(false));
  }, []);

  if (isPoweredOff) {
    return (
      <div className="boot-screen wallpaper-screen">
        <div className="boot-card ui-material ui-panel">
          <div className="boot-logo">
            <Power className="w-8 h-8" />
          </div>
          <h1>Powered down</h1>
          <p>Your AetherOS session has ended.</p>
          <button
            onClick={() => {
              setBootCompleted(false);
              powerOnSystem();
            }}
            className="ui-button primary"
          >
            <Power className="w-4 h-4" />
            <span>Power On AetherOS</span>
          </button>
        </div>
      </div>
    );
  }

  if (!bootCompleted || !booted) {
    return <BootScreen onComplete={finishBoot} />;
  }

  return (
    <div className="os-shell">
      <div inert={isLocked}>
        <Desktop />
        <Taskbar />
        <AppLauncher />
        <CommandPalette />
        <NotificationCenter />
        <QuickSettings />
        <DialogHost />
        <OfflineUpdate />
      </div>
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
