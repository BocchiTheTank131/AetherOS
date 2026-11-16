// AetherOS - Host-to-Guest Application Protocol Definitions

export interface HostInitMessage {
  type: 'aether:init';
  sessionToken: string;
  appId: string;
  appInfo: {
    id: string;
    name: string;
    version: string;
    author?: string;
  };
  theme: {
    mode: 'dark' | 'light';
    accentColor: string;
  };
}

export type AppLifecycleEvent =
  | 'ready'
  | 'focus'
  | 'blur'
  | 'suspend'
  | 'resume'
  | 'beforeClose'
  | 'themeChange';

export interface HostEventMessage {
  type: 'aether:event';
  event: AppLifecycleEvent;
  payload?: unknown;
}

export interface AppRequestMessage {
  id: string;
  type: 'req';
  action: string;
  payload?: unknown;
  sessionToken: string;
  appId: string;
}

export interface HostResponseMessage {
  id: string;
  type: 'res';
  success: boolean;
  data?: unknown;
  error?: string;
}

export const PROTOCOL_LIMITS = {
  maxPayloadBytes: 5 * 1024 * 1024, // 5MB
  maxRequestsPerSecond: 100,
  requestTimeoutMs: 15000,
} as const;

export function isValidAppRequest(msg: unknown): msg is AppRequestMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.id === 'string' && m.id.length <= 128 &&
    m.type === 'req' &&
    typeof m.action === 'string' && m.action.length <= 64 &&
    typeof m.sessionToken === 'string' && m.sessionToken.length <= 64 &&
    typeof m.appId === 'string' && m.appId.length <= 128 &&
    (m.payload === undefined || (m.payload !== null && typeof m.payload === 'object' &&
      Object.getPrototypeOf(m.payload) === Object.prototype))
  );
}
