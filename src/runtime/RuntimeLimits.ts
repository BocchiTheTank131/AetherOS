// AetherOS - Runtime Resource Limits Configuration

export interface RuntimeLimits {
  timeoutMs: number;
  maxOutputBytes: number;
  maxActiveSessions: number;
}

export const DEFAULT_RUNTIME_LIMITS: RuntimeLimits = {
  timeoutMs: 15000,
  maxOutputBytes: 1024 * 1024 * 2, // 2MB
  maxActiveSessions: 8,
};
