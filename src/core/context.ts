import { createContext, useContext } from 'react';
import type { SystemTheme, UserAccount, SystemNotification } from './types';
import type { WindowInstance } from '../desktop/types';

export interface SystemContextValue {
  booted: boolean;
  theme: SystemTheme;
  setTheme: (theme: Partial<SystemTheme>) => void;
  user: UserAccount;
  setUser: (user: Partial<UserAccount>) => void;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  notifications: SystemNotification[];
  addNotification: (notif: Omit<SystemNotification, 'id' | 'timestamp' | 'read'>) => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
  windows: WindowInstance[];
  openWindow: (appId: string, props?: Record<string, unknown>) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  snapWindow: (id: string, side: 'left' | 'right' | 'top') => void;
  updateWindowPosition: (id: string, x: number, y: number) => void;
  updateWindowSize: (id: string, width: number, height: number, x?: number, y?: number) => void;
  updateWindowTitle: (id: string, title: string) => void;
  recentApps: string[];
  activeWorkspace: number;
  setActiveWorkspace: (id: number) => void;
  appLauncherOpen: boolean;
  setAppLauncherOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  quickRunnerOpen: boolean;
  setQuickRunnerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  quickSettingsOpen: boolean;
  setQuickSettingsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  notificationCenterOpen: boolean;
  setNotificationCenterOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  rebootSystem: () => void;
  shutdownSystem: () => void;
  isPoweredOff: boolean;
  powerOnSystem: () => void;
}

export const SystemContext = createContext<SystemContextValue | null>(null);

export const useSystem = () => {
  const ctx = useContext(SystemContext);
  if (!ctx) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return ctx;
};
