// AetherOS - Aether App SDK Type Declarations

export interface AppInfo {
  id: string;
  name: string;
  version: string;
  author?: string;
  permissions?: string[];
}

export interface AppNotificationOptions {
  title: string;
  body?: string;
  icon?: string;
}

export interface ThemeInfo {
  mode: 'dark' | 'light';
  accentColor: string;
}

export type EventHandler<T = unknown> = (data: T) => void;

export interface AetherSDK {
  app: {
    getInfo(): Promise<AppInfo>;
    close(): Promise<void>;
  };
  window: {
    setTitle(title: string): Promise<void>;
    setMinimumSize(width: number, height: number): Promise<void>;
  };
  fs: {
    readText(path: string): Promise<string>;
    writeText(path: string, content: string): Promise<void>;
    readBytes(path: string): Promise<Uint8Array>;
    writeBytes(path: string, bytes: Uint8Array): Promise<void>;
    exists(path: string): Promise<boolean>;
  };
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<boolean>;
    list(): Promise<string[]>;
  };
  notifications: {
    show(options: AppNotificationOptions): Promise<void>;
  };
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
  };
  permissions: {
    query(scope: string): Promise<'granted' | 'denied' | 'prompt'>;
    request(scope: string): Promise<boolean>;
  };
  system: {
    getTheme(): Promise<ThemeInfo>;
  };
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
}

declare global {
  interface Window {
    aether?: AetherSDK;
  }
}
