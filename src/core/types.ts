// AetherOS - Core Type Definitions

export type ProcessState =
  | 'created'
  | 'running'
  | 'waiting'
  | 'suspended'
  | 'stopped'
  | 'terminated'
  | 'crashed';

export interface Process {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  args: string[];
  user: string;
  state: ProcessState;
  startTime: number;
  cpuPercent: number;
  memoryKb: number;
  windowId?: string;
  appId?: string;
  worker?: Worker;
  cleanup?: () => void;
  exitCode?: number;
}

export type SignalType = 'SIGINT' | 'SIGTERM' | 'SIGKILL' | 'SIGSTOP' | 'SIGCONT';

export interface SystemService {
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'failed' | 'starting';
  startedAt?: number;
  start: () => Promise<void> | void;
  stop: () => Promise<void> | void;
}

export interface UserAccount {
  username: string;
  displayName: string;
  avatar: string; // url or icon name
  role: 'admin' | 'standard';
  homeDir: string;
  shell: string;
  passwordHash?: string; // stored hashed or dummy for local auth
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  appId?: string;
  timestamp: number;
  read: boolean;
  actions?: Array<{ label: string; action: () => void }>;
}

export interface SystemLogEntry {
  id: string;
  timestamp: number;
  subsystem: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
}

export interface SystemTheme {
  mode: 'dark' | 'light';
  accentColor: string; // hex or tailwind name, e.g. 'cyan', 'purple', 'emerald'
  accentHex: string;
  wallpaper: string;
  transparency: boolean;
  blur: boolean;
  reducedMotion: boolean;
  fontSize: 'small' | 'medium' | 'large';
  dockPosition: 'bottom' | 'top' | 'left';
  dockAutoHide: boolean;
}

export interface SystemEvents {
  'system:ready': { timestamp: number };
  'system:shutdown': { timestamp: number };
  'system:restart': { timestamp: number };
  'process:started': { process: Process };
  'process:terminated': { pid: number; exitCode: number };
  'process:updated': { process: Process };
  'filesystem:changed': { path: string; operation: 'create' | 'modify' | 'delete' | 'move' };
  'package:installed': { packageId: string; version?: string };
  'package:updated': { packageId: string; version: string };
  'package:removed': { packageId: string };
  'app:registered': { appId: string };
  'app:unregistered': { appId: string };
  'permission:changed': { appId: string; scope: string; state: string };
  'app:close_requested': { appId: string };
  'window:open_requested': { appId: string; props?: Record<string, unknown> };
  'notification:show': { appId: string; title?: unknown; body?: unknown };
  'theme:changed': { theme: SystemTheme };
  'notification:created': { notification: SystemNotification };
  'user:switched': { user: UserAccount };
  'session:locked': { locked: boolean };
  'window:opened': { windowId: string; appId: string };
  'window:closed': { windowId: string };
  'window:focused': { windowId: string };
}
