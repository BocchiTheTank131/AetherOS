// AetherOS - Virtual Filesystem Type Definitions

export type VFSNodeType = 'file' | 'dir' | 'symlink';

export interface VFSMetadata {
  name: string;
  path: string;
  parentPath: string;
  type: VFSNodeType;
  size: number;
  createdAt: number;
  modifiedAt: number;
  permissions: number; // e.g., 0o755, 0o644
  owner: string;
  group: string;
  mimeType?: string;
}

export interface VFSNode extends VFSMetadata {
  content?: string; // UTF-8 text or base64 data: URL
  targetPath?: string; // For symlink
  isBinary?: boolean;
}

export interface VFSEntry {
  name: string;
  path: string;
  type: VFSNodeType;
  size: number;
  modifiedAt: number;
  mimeType?: string;
  permissions: number;
  owner: string;
}

export interface VFSStats extends VFSMetadata {
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
}

export type VFSWatchCallback = (event: {
  path: string;
  operation: 'create' | 'modify' | 'delete' | 'move';
}) => void;
