// AetherOS - Virtual Filesystem Type Definitions (AetherFS 2.0)

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
  content?: string; // UTF-8 text or data: URL representation
  binaryContent?: Uint8Array; // Raw byte buffer for binary-safe operations
  targetPath?: string; // For symlinks
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

export interface VFSUserContext {
  username: string;
  uid: number;
  gid: number;
  groups?: string[];
}

export interface VFSWriteOptions {
  owner?: string;
  group?: string;
  permissions?: number;
  isBinary?: boolean;
  context?: Partial<VFSUserContext> & { user?: string };
}

export type VFSWatchCallback = (event: {
  path: string;
  operation: 'create' | 'modify' | 'delete' | 'move';
}) => void;

export interface VFSBackupData {
  version: '2.0' | number;
  createdAt: number;
  filesCount?: number;
  nodeCount: number;
  checksum: string;
  nodes: Array<Omit<VFSNode, 'binaryContent'> & { binaryBase64?: string }>;
}
