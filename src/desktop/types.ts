// AetherOS - Desktop Environment & Window Manager Types

export type WindowDisplayState =
  | 'normal'
  | 'minimized'
  | 'maximized'
  | 'snapped-left'
  | 'snapped-right';

export interface WindowInstance {
  id: string;
  appId: string;
  pid: number;
  title: string;
  icon: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  zIndex: number;
  state: WindowDisplayState;
  workspaceId: number;
  isFocused: boolean;
  props?: Record<string, unknown>;
}

export interface Workspace {
  id: number;
  name: string;
}

export interface DesktopShortcut {
  id: string;
  name: string;
  icon: string;
  appId: string;
  path?: string;
  x?: number;
  y?: number;
}
