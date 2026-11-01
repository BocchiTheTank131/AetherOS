// AetherOS - Runtime Permission Scopes & Verification
import { vfs } from '../vfs/vfs';

export type RuntimePermissionScope =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'filesystem:home'
  | 'filesystem:project'
  | 'network:fetch';

export interface RuntimePermissions {
  scopes: Set<RuntimePermissionScope>;
  allowedReadPaths: string[];
  allowedWritePaths: string[];
}

export function createDefaultPermissions(): RuntimePermissions {
  return {
    scopes: new Set(['filesystem:read', 'filesystem:write', 'filesystem:home', 'filesystem:project']),
    allowedReadPaths: ['/home/aether', '/etc', '/usr', '/tmp', '/proc', '/dev'],
    allowedWritePaths: ['/home/aether', '/tmp'],
  };
}

export function checkRuntimePathAccess(
  path: string,
  mode: 'read' | 'write',
  permissions: RuntimePermissions
): boolean {
  const norm = vfs.normalizePath(path);
  if (mode === 'read') {
    if (!permissions.scopes.has('filesystem:read')) return false;
    return permissions.allowedReadPaths.some(
      (prefix) => norm === prefix || norm.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')
    );
  }

  if (mode === 'write') {
    if (!permissions.scopes.has('filesystem:write')) return false;
    return permissions.allowedWritePaths.some(
      (prefix) => norm === prefix || norm.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')
    );
  }

  return false;
}
