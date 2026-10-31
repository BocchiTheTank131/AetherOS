// AetherOS - Application Platform & SDK Types
import type { ComponentType } from 'react';

export interface AppProps {
  windowId: string;
  pid: number;
  initialProps?: Record<string, unknown>;
  onClose?: () => void;
  setTitle?: (title: string) => void;
  isFocused?: boolean;
}

export interface AppDefinition {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  category: 'System' | 'Accessories' | 'Development' | 'Media' | 'Internet' | 'Games' | 'Utilities';
  description: string;
  component: ComponentType<AppProps>;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  singleton?: boolean;
  executable?: string;
}
