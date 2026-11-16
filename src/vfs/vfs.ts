// AetherOS - Core Virtual Filesystem (VFS) - AetherFS 2.0
import type {
  VFSNode,
  VFSEntry,
  VFSStats,
  VFSWatchCallback,
  VFSUserContext,
  VFSWriteOptions,
  VFSBackupData,
} from './types';
import { getMimeType } from './mime';
import { idbStorage, isStoredNode } from './idbStorage';
import { createDefaultFileSystem } from './initFs';
import { systemLogger } from '../core/logger';
import { systemEventBus } from '../core/eventBus';
import { virtualKernel } from '../core/kernel';
import { AETHER_VERSION } from '../core/version';

async function computeSha256(data: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback below
    }
  }
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export class VirtualFileSystem {
  private nodes = new Map<string, VFSNode>();
  private watchers = new Map<string, Set<VFSWatchCallback>>();
  private initialization?: Promise<void>;
  private replacing = false;
  private batch?: {
    changes: Map<string, VFSNode | null>;
    events: Array<Parameters<VFSWatchCallback>[0]>;
  };
  private currentContext: VFSUserContext = {
    username: 'aether',
    uid: 1000,
    gid: 1000,
    groups: ['aether', 'users'],
  };

  public init(): Promise<void> {
    return this.initialization ??= this.load();
  }

  public flush(): Promise<boolean> {
    return idbStorage.flush();
  }

  private async load(): Promise<void> {

    try {
      await idbStorage.init();
      const storedNodes = await idbStorage.loadAll();

      if (storedNodes.size > 0 && storedNodes.has('/')) {
        this.nodes = storedNodes;
        const osRelease = storedNodes.get('/etc/os-release');
        if (osRelease?.type === 'file' && osRelease.content?.startsWith('NAME="AetherOS"') &&
            !osRelease.content.includes(`VERSION_ID="${AETHER_VERSION.version}"`)) {
          const current = createDefaultFileSystem().get('/etc/os-release')!;
          const updated = { ...osRelease, content: current.content, size: current.size, binaryContent: undefined, modifiedAt: Date.now() };
          this.nodes.set(updated.path, updated);
          this.queueChange(updated.path, updated);
        }
        systemLogger.info('vfs', `Restored existing VFS with ${this.nodes.size} nodes`);
      } else {
        this.nodes = createDefaultFileSystem();
        for (const [path, node] of storedNodes) this.nodes.set(path, node);
        systemLogger.info('vfs', `Created fresh Linux VFS skeleton with ${this.nodes.size} nodes`);
        // Persist default structure
        for (const node of this.nodes.values()) {
          idbStorage.queueSave(node);
        }
        await idbStorage.flush();
      }
    } catch (err) {
      systemLogger.error('vfs', `VFS initialization failed: ${String(err)}`);
      this.nodes = createDefaultFileSystem();
    }
  }

  public atomicBatch<T>(operation: () => T): T {
    this.assertWritable();
    if (this.batch) throw new Error('A filesystem batch is already active');
    const previous = new Map(this.nodes);
    const batch = { changes: new Map<string, VFSNode | null>(), events: [] as Array<Parameters<VFSWatchCallback>[0]> };
    this.batch = batch;
    let result: T;
    try {
      result = operation();
    } catch (error) {
      this.nodes = previous;
      throw error;
    } finally {
      this.batch = undefined;
    }
    for (const [path, node] of batch.changes) this.queueChange(path, node);
    for (const event of batch.events) this.notifyWatchers(event.path, event.operation);
    return result;
  }

  private queueChange(path: string, node: VFSNode | null): void {
    if (this.batch) this.batch.changes.set(path, node);
    else if (node) idbStorage.queueSave(node);
    else idbStorage.queueDelete(path);
  }

  private assertWritable(): void {
    if (this.replacing) throw new Error('AetherFS is restoring a snapshot');
  }

  public setContext(context: VFSUserContext): void {
    this.currentContext = context;
  }

  public getContext(): VFSUserContext {
    return { ...this.currentContext };
  }

  /**
   * Check POSIX-like virtual access control permissions for a given path and mode
   */
  public checkAccess(
    path: string,
    mode: 'r' | 'w' | 'x' | number,
    context?: Partial<VFSUserContext> & { user?: string }
  ): boolean {
    const rawUser = context?.username || context?.user || (context?.uid === 0 ? 'root' : this.currentContext.username);
    const ctx: VFSUserContext = {
      uid: context?.uid ?? (rawUser === 'root' ? 0 : 1000),
      gid: context?.gid ?? (rawUser === 'root' ? 0 : 1000),
      username: rawUser,
      groups: context?.groups ?? (rawUser === 'root' ? ['root'] : [rawUser]),
    };

    const modeChar: 'r' | 'w' | 'x' =
      typeof mode === 'number' ? (mode === 1 ? 'x' : mode === 2 ? 'w' : 'r') : mode;

    if (ctx.uid === 0 || ctx.username === 'root') {
      if (modeChar === 'x') {
        const node = this.getNodeRaw(path);
        if (node && node.type === 'file') {
          return (node.permissions & 0o111) !== 0;
        }
      }
      return true;
    }

    const norm = this.normalizePath(path);
    if (norm.startsWith('/proc') || norm.startsWith('/dev')) {
      if (modeChar === 'w') {
        return norm === '/dev/null';
      }
      return true;
    }

    const node = this.getNodeRaw(norm);
    if (!node) {
      // For non-existent paths, verify parent traversal and write permission if creating
      const parts = norm.split('/').filter(Boolean);
      let currPath = '';
      const parentDepth = parts.length > 1 ? parts.length - 1 : 0;
      for (let i = 0; i < parentDepth; i++) {
        currPath += '/' + parts[i];
        const dirNode = this.nodes.get(currPath);
        if (dirNode && dirNode.type === 'dir') {
          if (!this.checkNodePermission(dirNode, 'x', ctx)) {
            return false;
          }
        }
      }
      if (modeChar === 'w' && parts.length > 1) {
        const parentPath = '/' + parts.slice(0, -1).join('/');
        const parentDir = this.nodes.get(parentPath);
        if (parentDir && parentDir.type === 'dir') {
          return this.checkNodePermission(parentDir, 'w', ctx);
        }
      }
      return true;
    }

    // Verify parent directory traversal (execute permission)
    const parts = norm.split('/').filter(Boolean);
    let currPath = '';
    const parentDepth = node.type === 'dir' ? parts.length : parts.length - 1;
    for (let i = 0; i < parentDepth; i++) {
      currPath += '/' + parts[i];
      const dirNode = this.nodes.get(currPath);
      if (dirNode && dirNode.type === 'dir') {
        if (!this.checkNodePermission(dirNode, 'x', ctx)) {
          return false;
        }
      }
    }

    return this.checkNodePermission(node, modeChar, ctx);
  }

  private checkNodePermission(node: VFSNode, mode: 'r' | 'w' | 'x', ctx: VFSUserContext): boolean {
    if (ctx.uid === 0 || ctx.username === 'root') return true;

    const isOwner = node.owner === ctx.username || node.owner === String(ctx.uid);
    const isGroup = node.group === ctx.username || (ctx.groups && ctx.groups.includes(node.group));

    const shift = isOwner ? 6 : isGroup ? 3 : 0;
    const bits = (node.permissions >> shift) & 7;

    if (mode === 'r') return (bits & 4) !== 0;
    if (mode === 'w') return (bits & 2) !== 0;
    if (mode === 'x') return (bits & 1) !== 0;
    return false;
  }

  /**
   * Normalize path (resolves ., .., double slashes, trailing slash)
   */
  public normalizePath(path: string): string {
    if (!path || path === '') return '/';

    const isAbsolute = path.startsWith('/');
    const segments = path.split('/').filter(Boolean);
    const resolved: string[] = [];

    for (const seg of segments) {
      if (seg === '.') continue;
      if (seg === '..') {
        if (resolved.length > 0) {
          resolved.pop();
        }
      } else {
        resolved.push(seg);
      }
    }

    const result = (isAbsolute ? '/' : '') + resolved.join('/');
    return result === '' ? '/' : result;
  }

  /**
   * Resolve a path relative to working directory
   */
  public resolve(cwd: string, targetPath: string): string {
    if (targetPath.startsWith('~')) {
      targetPath = '/home/aether' + targetPath.slice(1);
    }
    if (targetPath.startsWith('/')) {
      return this.normalizePath(targetPath);
    }
    return this.normalizePath(cwd + '/' + targetPath);
  }

  /**
   * Handle dynamic virtual filesystem nodes (/proc, /dev)
   */
  private getDynamicNode(path: string): VFSNode | null {
    const norm = this.normalizePath(path);

    // /proc
    if (norm === '/proc') {
      return {
        name: 'proc',
        path: '/proc',
        parentPath: '/',
        type: 'dir',
        size: 0,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o555,
        owner: 'root',
        group: 'root',
      };
    }

    if (norm === '/proc/uptime') {
      const up = virtualKernel.getUptimeSeconds();
      return {
        name: 'uptime',
        path: '/proc/uptime',
        parentPath: '/proc',
        type: 'file',
        size: 32,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o444,
        owner: 'root',
        group: 'root',
        content: `${up.toFixed(2)} ${Math.floor(up * 0.8)}.00\n`,
      };
    }

    if (norm === '/proc/version') {
      const verContent = `AetherCore virtual kernel version ${AETHER_VERSION.kernel} (AetherOS v${AETHER_VERSION.version} ${AETHER_VERSION.codename}; ${AETHER_VERSION.architecture}) #1 SMP PREEMPT\n`;
      return {
        name: 'version',
        path: '/proc/version',
        parentPath: '/proc',
        type: 'file',
        size: verContent.length,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o444,
        owner: 'root',
        group: 'root',
        content: verContent,
      };
    }

    // Dynamic /proc/<pid> directories and process status
    const procStatusMatch = norm.match(/^\/proc\/(\d+)\/status$/);
    if (procStatusMatch) {
      const pid = parseInt(procStatusMatch[1], 10);
      const proc = virtualKernel.getProcess(pid);
      if (proc) {
        const stateChar = proc.state === 'running' ? 'R (running)' : proc.state === 'stopped' ? 'T (stopped)' : 'Z (zombie)';
        const statusContent = [
          `Name:\t${proc.name}`,
          `Umask:\t0022`,
          `State:\t${stateChar}`,
          `Tgid:\t${proc.pid}`,
          `Ngid:\t0`,
          `Pid:\t${proc.pid}`,
          `PPid:\t${proc.ppid}`,
          `Uid:\t${proc.user === 'root' ? '0\t0\t0\t0' : '1000\t1000\t1000\t1000'}`,
          `Gid:\t${proc.user === 'root' ? '0\t0\t0\t0' : '1000\t1000\t1000\t1000'}`,
          `FDSize:\t64`,
          `VmPeak:\t${proc.memoryKb} kB`,
          `VmSize:\t${proc.memoryKb} kB`,
          `VmRSS:\t${proc.memoryKb} kB`,
          `Threads:\t1`,
          '',
        ].join('\n');
        return {
          name: 'status',
          path: norm,
          parentPath: `/proc/${pid}`,
          type: 'file',
          size: statusContent.length,
          createdAt: proc.startTime,
          modifiedAt: Date.now(),
          permissions: 0o444,
          owner: proc.user,
          group: 'aether',
          content: statusContent,
        };
      }
    }

    const procCmdlineMatch = norm.match(/^\/proc\/(\d+)\/cmdline$/);
    if (procCmdlineMatch) {
      const pid = parseInt(procCmdlineMatch[1], 10);
      const proc = virtualKernel.getProcess(pid);
      if (proc) {
        const cmdContent = [proc.command, ...(proc.args || [])].join('\0') + '\0';
        return {
          name: 'cmdline',
          path: norm,
          parentPath: `/proc/${pid}`,
          type: 'file',
          size: cmdContent.length,
          createdAt: proc.startTime,
          modifiedAt: Date.now(),
          permissions: 0o444,
          owner: proc.user,
          group: 'aether',
          content: cmdContent,
        };
      }
    }

    const procDirMatch = norm.match(/^\/proc\/(\d+)$/);
    if (procDirMatch) {
      const pid = parseInt(procDirMatch[1], 10);
      const proc = virtualKernel.getProcess(pid);
      if (proc) {
        return {
          name: String(pid),
          path: norm,
          parentPath: '/proc',
          type: 'dir',
          size: 0,
          createdAt: proc.startTime,
          modifiedAt: Date.now(),
          permissions: 0o555,
          owner: proc.user,
          group: 'aether',
        };
      }
    }

    if (norm === '/proc/meminfo') {
      const mem = virtualKernel.getTotalMemoryUsage();
      const totalMem = mem.totalKb;
      const usedMem = mem.usedKb;
      const freeMem = Math.max(0, totalMem - usedMem);
      const meminfo = [
        `MemTotal:        ${totalMem} kB`,
        `MemFree:         ${freeMem} kB`,
        `MemAvailable:    ${freeMem} kB`,
        `Buffers:           32768 kB`,
        `Cached:           131072 kB`,
        `SwapTotal:             0 kB`,
        `SwapFree:              0 kB`,
        '',
      ].join('\n');

      return {
        name: 'meminfo',
        path: '/proc/meminfo',
        parentPath: '/proc',
        type: 'file',
        size: meminfo.length,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o444,
        owner: 'root',
        group: 'root',
        content: meminfo,
      };
    }

    if (norm === '/proc/cpuinfo') {
      const cpus = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
      let cpuinfo = '';
      for (let i = 0; i < cpus; i++) {
        cpuinfo += [
          `processor\t: ${i}`,
          'vendor_id\t: GenuineIntel',
          'cpu family\t: 6',
          'model\t\t: 158',
          'model name\t: Aether Virtual Core Processor @ 3.00GHz',
          'stepping\t: 9',
          'cpu MHz\t\t: 3000.000',
          'cache size\t: 8192 KB',
          'flags\t\t: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov',
          'bogomips\t: 6000.00',
          '',
          '',
        ].join('\n');
      }

      return {
        name: 'cpuinfo',
        path: '/proc/cpuinfo',
        parentPath: '/proc',
        type: 'file',
        size: cpuinfo.length,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o444,
        owner: 'root',
        group: 'root',
        content: cpuinfo,
      };
    }

    // /dev
    if (norm === '/dev') {
      return {
        name: 'dev',
        path: '/dev',
        parentPath: '/',
        type: 'dir',
        size: 0,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o755,
        owner: 'root',
        group: 'root',
      };
    }

    if (norm === '/dev/null') {
      return {
        name: 'null',
        path: '/dev/null',
        parentPath: '/dev',
        type: 'file',
        size: 0,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o666,
        owner: 'root',
        group: 'root',
        content: '',
      };
    }

    if (norm === '/dev/zero') {
      return {
        name: 'zero',
        path: '/dev/zero',
        parentPath: '/dev',
        type: 'file',
        size: 0,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o666,
        owner: 'root',
        group: 'root',
        content: '\0'.repeat(128),
      };
    }

    if (norm === '/dev/random' || norm === '/dev/urandom') {
      const arr = new Uint8Array(64);
      if (typeof crypto !== 'undefined') {
        crypto.getRandomValues(arr);
      } else {
        for (let i = 0; i < 64; i++) arr[i] = Math.floor(Math.random() * 256);
      }
      let randStr = '';
      for (let i = 0; i < arr.length; i++) {
        randStr += String.fromCharCode(arr[i]);
      }

      return {
        name: norm === '/dev/random' ? 'random' : 'urandom',
        path: norm,
        parentPath: '/dev',
        type: 'file',
        size: 64,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o666,
        owner: 'root',
        group: 'root',
        content: randStr,
      };
    }

    return null;
  }

  public exists(path: string): boolean {
    const norm = this.normalizePath(path);
    if (this.getDynamicNode(norm)) return true;
    return this.nodes.has(norm);
  }

  public getNodeRaw(path: string): VFSNode | null {
    const norm = this.normalizePath(path);
    const dynamic = this.getDynamicNode(norm);
    if (dynamic) return dynamic;
    return this.nodes.get(norm) || null;
  }

  public getNode(path: string, depth = 0): VFSNode | null {
    if (depth > 20) {
      throw new Error(`ELOOP: too many levels of symbolic links, '${path}'`);
    }
    const norm = this.normalizePath(path);
    const dynamic = this.getDynamicNode(norm);
    if (dynamic) return dynamic;

    const node = this.nodes.get(norm);
    if (!node) return null;

    // Follow symlinks for read/stat operations
    if (node.type === 'symlink' && node.targetPath) {
      const targetAbs = node.targetPath.startsWith('/')
        ? this.normalizePath(node.targetPath)
        : this.resolve(node.parentPath, node.targetPath);
      return this.getNode(targetAbs, depth + 1);
    }
    return node;
  }

  public stat(path: string): VFSStats {
    const node = this.getNode(path);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }

    return {
      ...node,
      isDirectory: () => node.type === 'dir',
      isFile: () => node.type === 'file',
      isSymbolicLink: () => node.type === 'symlink',
    };
  }

  public lstat(path: string): VFSStats {
    const norm = this.normalizePath(path);
    const dynamic = this.getDynamicNode(norm);
    const node = dynamic || this.nodes.get(norm);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, lstat '${path}'`);
    }

    return {
      ...node,
      isDirectory: () => node.type === 'dir',
      isFile: () => node.type === 'file',
      isSymbolicLink: () => node.type === 'symlink',
    };
  }

  public readBytes(path: string): Uint8Array {
    return this.readBytesSync(path);
  }

  public readBytesSync(path: string, depth = 0): Uint8Array {
    if (depth > 20) {
      throw new Error(`ELOOP: too many levels of symbolic links, '${path}'`);
    }
    const norm = this.normalizePath(path);
    if (!this.checkAccess(norm, 'r')) {
      throw new Error(`EACCES: permission denied, read '${path}'`);
    }

    const dynamic = this.getDynamicNode(norm);
    if (dynamic) {
      return new TextEncoder().encode(dynamic.content ?? '');
    }

    const node = this.nodes.get(norm);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    if (node.type === 'dir') {
      throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
    }
    if (node.type === 'symlink' && node.targetPath) {
      const targetAbs = node.targetPath.startsWith('/')
        ? this.normalizePath(node.targetPath)
        : this.resolve(node.parentPath, node.targetPath);
      return this.readBytesSync(targetAbs, depth + 1);
    }

    if (node.binaryContent) {
      return node.binaryContent;
    }

    if (node.content) {
      if (node.isBinary && node.content.startsWith('data:')) {
        const base64Data = node.content.split(',')[1] || '';
        const binStr = atob(base64Data);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        node.binaryContent = bytes;
        return bytes;
      }
      return new TextEncoder().encode(node.content);
    }

    return new Uint8Array(0);
  }

  public async writeBytes(path: string, data: Uint8Array, options?: VFSWriteOptions): Promise<void> {
    this.writeBytesSync(path, data, options);
  }

  public writeBytesSync(path: string, data: Uint8Array, options?: VFSWriteOptions): void {
    this.assertWritable();
    const norm = this.normalizePath(path);
    if (norm === '/dev/null') return;

    const parts = norm.split('/').filter(Boolean);
    if (parts.length === 0) {
      throw new Error(`EISDIR: cannot write directly to root directory`);
    }

    const name = parts[parts.length - 1];
    const parentPath = parts.length === 1 ? '/' : '/' + parts.slice(0, -1).join('/');
    const existing = this.nodes.get(norm);

    if (options?.context) {
      if (existing) {
        if (!this.checkAccess(norm, 'w', options.context)) {
          throw new Error(`EACCES: permission denied, write '${path}'`);
        }
      } else {
        if (!this.checkAccess(parentPath, 'w', options.context)) {
          throw new Error(`EACCES: permission denied, write '${path}'`);
        }
      }
    }

    const parent = this.getNode(parentPath);
    if (!parent) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    if (parent.type !== 'dir') {
      throw new Error(`ENOTDIR: not a directory, '${parentPath}'`);
    }

    const now = Date.now();
    const mime = getMimeType(name);
    const isText =
      mime.startsWith('text/') ||
      mime.includes('json') ||
      mime.includes('javascript') ||
      mime.includes('typescript') ||
      mime.includes('xml') ||
      mime.includes('sh');

    const node: VFSNode = {
      name,
      path: norm,
      parentPath,
      type: 'file',
      binaryContent: data,
      size: data.byteLength,
      createdAt: existing ? existing.createdAt : now,
      modifiedAt: now,
      permissions: options?.permissions ?? existing?.permissions ?? 0o644,
      owner: options?.owner ?? existing?.owner ?? this.currentContext.username,
      group: options?.group ?? existing?.group ?? 'aether',
      mimeType: mime,
      isBinary: options?.isBinary ?? !isText,
    };

    this.nodes.set(norm, node);
    this.queueChange(node.path, node);
    this.notifyWatchers(norm, existing ? 'modify' : 'create');
  }

  public readText(path: string): string {
    return this.readFile(path);
  }

  public writeText(path: string, content: string, options?: VFSWriteOptions): void {
    this.writeFile(path, content, options);
  }

  public readFile(path: string, depth = 0): string {
    if (depth > 20) {
      throw new Error(`ELOOP: too many levels of symbolic links, '${path}'`);
    }
    const norm = this.normalizePath(path);
    if (!this.checkAccess(norm, 'r')) {
      throw new Error(`EACCES: permission denied, read '${path}'`);
    }

    const dynamic = this.getDynamicNode(norm);
    if (dynamic) return dynamic.content ?? '';

    const node = this.nodes.get(norm);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    if (node.type === 'dir') {
      throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
    }
    if (node.type === 'symlink' && node.targetPath) {
      const targetAbs = node.targetPath.startsWith('/')
        ? this.normalizePath(node.targetPath)
        : this.resolve(node.parentPath, node.targetPath);
      return this.readFile(targetAbs, depth + 1);
    }

    if (node.content !== undefined) {
      return node.content;
    }

    if (node.binaryContent) {
      if (node.isBinary) {
        // Construct base64 representation for binary consumers in safe chunks to avoid UI thread freeze
        let binaryStr = '';
        const len = node.binaryContent.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
          const chunk = node.binaryContent.subarray(i, Math.min(i + chunkSize, len));
          binaryStr += String.fromCharCode.apply(null, chunk as unknown as number[]);
        }
        return `data:${node.mimeType || 'application/octet-stream'};base64,${btoa(binaryStr)}`;
      }
      return new TextDecoder().decode(node.binaryContent);
    }

    return '';
  }

  public writeFile(
    path: string,
    content: string | Uint8Array,
    options?: VFSWriteOptions
  ): void {
    this.assertWritable();
    if (content instanceof Uint8Array) {
      this.writeBytesSync(path, content, options);
      return;
    }

    const norm = this.normalizePath(path);
    if (norm === '/dev/null') return;

    const parts = norm.split('/').filter(Boolean);
    if (parts.length === 0) {
      throw new Error(`EISDIR: cannot write directly to root directory`);
    }

    const name = parts[parts.length - 1];
    const parentPath = parts.length === 1 ? '/' : '/' + parts.slice(0, -1).join('/');
    const existing = this.nodes.get(norm);

    if (options?.context) {
      if (existing) {
        if (!this.checkAccess(norm, 'w', options.context)) {
          throw new Error(`EACCES: permission denied, write '${path}'`);
        }
      } else {
        if (!this.checkAccess(parentPath, 'w', options.context)) {
          throw new Error(`EACCES: permission denied, write '${path}'`);
        }
      }
    }

    // Check parent exists and is directory
    const parent = this.getNode(parentPath);
    if (!parent) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    if (parent.type !== 'dir') {
      throw new Error(`ENOTDIR: not a directory, '${parentPath}'`);
    }

    const now = Date.now();

    let binaryContent: Uint8Array | undefined;
    let storedContent: string | undefined = content;
    let size: number;
    const isBinary = options?.isBinary ?? existing?.isBinary ?? false;

    if (isBinary) {
      if (content.startsWith('data:')) {
        try {
          const base64Data = content.split(',')[1] || '';
          const binStr = atob(base64Data);
          binaryContent = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) {
            binaryContent[i] = binStr.charCodeAt(i);
          }
          size = binaryContent.byteLength;
        } catch {
          binaryContent = new TextEncoder().encode(content);
          size = binaryContent.byteLength;
        }
      } else {
        binaryContent = new TextEncoder().encode(content);
        size = binaryContent.byteLength;
      }
      storedContent = undefined; // Lazily reconstructed on demand
    } else {
      // Store string content and avoid allocating/duplicating Uint8Array memory
      size = new TextEncoder().encode(content).byteLength;
      binaryContent = undefined;
      storedContent = content;
    }

    const node: VFSNode = {
      name,
      path: norm,
      parentPath,
      type: 'file',
      content: storedContent,
      binaryContent,
      size,
      createdAt: existing ? existing.createdAt : now,
      modifiedAt: now,
      permissions: options?.permissions ?? existing?.permissions ?? 0o644,
      owner: options?.owner ?? existing?.owner ?? this.currentContext.username,
      group: options?.group ?? existing?.group ?? 'aether',
      mimeType: getMimeType(name),
      isBinary,
    };

    this.nodes.set(norm, node);
    this.queueChange(node.path, node);

    this.notifyWatchers(norm, existing ? 'modify' : 'create');
  }

  public appendFile(path: string, content: string | Uint8Array): void {
    const norm = this.normalizePath(path);
    if (content instanceof Uint8Array) {
      this.appendBytes(norm, content);
      return;
    }
    if (this.exists(norm)) {
      const node = this.getNode(norm);
      if (node && node.isBinary) {
        const appendedBytes = new TextEncoder().encode(content);
        this.appendBytes(norm, appendedBytes);
        return;
      }
      const existing = this.readFile(norm);
      this.writeFile(norm, existing + content);
    } else {
      this.writeFile(norm, content);
    }
  }

  public appendBytes(path: string, bytes: Uint8Array): void {
    const norm = this.normalizePath(path);
    if (this.exists(norm)) {
      const existingBytes = this.readBytesSync(norm);
      const combined = new Uint8Array(existingBytes.length + bytes.length);
      combined.set(existingBytes, 0);
      combined.set(bytes, existingBytes.length);
      this.writeBytesSync(norm, combined);
    } else {
      this.writeBytesSync(norm, bytes);
    }
  }

  public mkdir(
    path: string,
    options?: {
      recursive?: boolean;
      owner?: string;
      group?: string;
      permissions?: number;
      context?: Partial<VFSUserContext> & { user?: string };
    }
  ): void {
    this.assertWritable();
    const norm = this.normalizePath(path);
    if (norm === '/') return;

    if (this.exists(norm)) {
      if (options?.recursive) return;
      throw new Error(`EEXIST: file or directory already exists, mkdir '${path}'`);
    }

    const parts = norm.split('/').filter(Boolean);
    const parentPath = parts.length === 1 ? '/' : '/' + parts.slice(0, -1).join('/');

    const parent = this.nodes.get(parentPath);
    if (!parent) {
      if (options?.recursive) {
        this.mkdir(parentPath, { ...options });
      } else {
        throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
      }
    } else if (parent.type !== 'dir') {
      throw new Error(`ENOTDIR: not a directory, mkdir '${path}'`);
    }

    if (!this.checkAccess(parentPath, 'w', options?.context)) {
      throw new Error(`EACCES: permission denied, mkdir '${path}'`);
    }

    const name = parts[parts.length - 1];
    const now = Date.now();
    const node: VFSNode = {
      name,
      path: norm,
      parentPath,
      type: 'dir',
      size: 4096,
      createdAt: now,
      modifiedAt: now,
      permissions: options?.permissions ?? 0o755,
      owner: options?.owner ?? this.currentContext.username,
      group: options?.group ?? 'aether',
    };

    this.nodes.set(norm, node);
    this.queueChange(node.path, node);
    this.notifyWatchers(norm, 'create');
  }

  public readdir(path: string): VFSEntry[] {
    const norm = this.normalizePath(path);
    if (!this.checkAccess(norm, 'r')) {
      throw new Error(`EACCES: permission denied, readdir '${path}'`);
    }

    if (!this.exists(norm)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    const dirNode = this.getNode(norm);
    if (!dirNode || dirNode.type !== 'dir') {
      throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
    }

    const results: VFSEntry[] = [];

    // Synthesize /proc entries
    if (norm === '/proc') {
      const procEntries: VFSEntry[] = [
        { name: 'uptime', path: '/proc/uptime', type: 'file', size: 32, modifiedAt: Date.now(), permissions: 0o444, owner: 'root' },
        { name: 'version', path: '/proc/version', type: 'file', size: 64, modifiedAt: Date.now(), permissions: 0o444, owner: 'root' },
        { name: 'meminfo', path: '/proc/meminfo', type: 'file', size: 256, modifiedAt: Date.now(), permissions: 0o444, owner: 'root' },
        { name: 'cpuinfo', path: '/proc/cpuinfo', type: 'file', size: 512, modifiedAt: Date.now(), permissions: 0o444, owner: 'root' },
      ];
      for (const p of virtualKernel.getProcesses()) {
        procEntries.push({
          name: String(p.pid),
          path: `/proc/${p.pid}`,
          type: 'dir',
          size: 0,
          modifiedAt: p.startTime,
          permissions: 0o555,
          owner: p.user,
        });
      }
      return procEntries;
    }

    const pidDirMatch = norm.match(/^\/proc\/(\d+)$/);
    if (pidDirMatch) {
      const pid = parseInt(pidDirMatch[1], 10);
      const proc = virtualKernel.getProcess(pid);
      if (!proc) {
        throw new Error(`ENOENT: no such process or directory, scandir '${path}'`);
      }
      return [
        { name: 'status', path: `/proc/${pid}/status`, type: 'file', size: 256, modifiedAt: Date.now(), permissions: 0o444, owner: proc.user },
        { name: 'cmdline', path: `/proc/${pid}/cmdline`, type: 'file', size: 64, modifiedAt: Date.now(), permissions: 0o444, owner: proc.user },
      ];
    }

    // Synthesize /dev entries
    if (norm === '/dev') {
      return [
        { name: 'null', path: '/dev/null', type: 'file', size: 0, modifiedAt: Date.now(), permissions: 0o666, owner: 'root' },
        { name: 'zero', path: '/dev/zero', type: 'file', size: 0, modifiedAt: Date.now(), permissions: 0o666, owner: 'root' },
        { name: 'random', path: '/dev/random', type: 'file', size: 64, modifiedAt: Date.now(), permissions: 0o666, owner: 'root' },
        { name: 'urandom', path: '/dev/urandom', type: 'file', size: 64, modifiedAt: Date.now(), permissions: 0o666, owner: 'root' },
      ];
    }

    for (const node of this.nodes.values()) {
      if (node.parentPath === norm) {
        // Hide internal metadata folder inside trash
        if (norm === '/home/aether/.trash' && node.name === '.info') {
          continue;
        }
        results.push({
          name: node.name,
          path: node.path,
          type: node.type,
          size: node.size,
          modifiedAt: node.modifiedAt,
          mimeType: node.mimeType,
          permissions: node.permissions,
          owner: node.owner,
        });
      }
    }

    return results.sort((a, b) => {
      // Directories first, then alphabetical
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (a.type !== 'dir' && b.type === 'dir') return 1;
      return a.name.localeCompare(b.name);
    });
  }

  public unlink(path: string): void {
    this.assertWritable();
    const norm = this.normalizePath(path);
    if (!this.checkAccess(norm, 'w')) {
      throw new Error(`EACCES: permission denied, unlink '${path}'`);
    }

    const node = this.nodes.get(norm);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }
    if (node.type === 'dir') {
      throw new Error(`EISDIR: illegal operation on a directory, unlink '${path}'`);
    }

    this.nodes.delete(norm);
    this.queueChange(norm, null);
    this.notifyWatchers(norm, 'delete');
  }

  public rmdir(path: string, options?: { recursive?: boolean }): void {
    this.assertWritable();
    const norm = this.normalizePath(path);
    if (norm === '/') {
      throw new Error(`EBUSY: resource busy or locked, rmdir '/'`);
    }

    if (!this.checkAccess(norm, 'w')) {
      throw new Error(`EACCES: permission denied, rmdir '${path}'`);
    }

    const node = this.nodes.get(norm);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
    }
    if (node.type !== 'dir') {
      throw new Error(`ENOTDIR: not a directory, rmdir '${path}'`);
    }

    // Check children
    const children = this.readdir(norm);
    if (children.length > 0 && !options?.recursive) {
      throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
    }

    if (options?.recursive) {
      // Recursively delete all nodes with prefix
      const prefix = norm + '/';
      for (const p of Array.from(this.nodes.keys())) {
        if (p === norm || p.startsWith(prefix)) {
          this.nodes.delete(p);
          this.queueChange(p, null);
          this.notifyWatchers(p, 'delete');
        }
      }
    } else {
      this.nodes.delete(norm);
      this.queueChange(norm, null);
      this.notifyWatchers(norm, 'delete');
    }
  }

  public rename(oldPath: string, newPath: string): void {
    this.assertWritable();
    const normOld = this.normalizePath(oldPath);
    const normNew = this.normalizePath(newPath);

    if (normOld === normNew) return;
    if (!this.checkAccess(normOld, 'w')) {
      throw new Error(`EACCES: permission denied, rename '${oldPath}'`);
    }

    const oldNode = this.nodes.get(normOld);
    if (!oldNode) {
      throw new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
    }

    if (oldNode.type === 'dir' && (normNew === normOld || normNew.startsWith(normOld + '/'))) {
      throw new Error(`EINVAL: cannot move directory '${oldPath}' into its own subdirectory '${newPath}'`);
    }

    const newParts = normNew.split('/').filter(Boolean);
    const newName = newParts[newParts.length - 1];
    const newParent = newParts.length === 1 ? '/' : '/' + newParts.slice(0, -1).join('/');

    if (!this.checkAccess(newParent, 'w')) {
      throw new Error(`EACCES: permission denied, rename destination parent '${newParent}'`);
    }

    if (!this.exists(newParent)) {
      throw new Error(`ENOENT: destination parent does not exist '${newParent}'`);
    }

    const existingTarget = this.nodes.get(normNew);
    if (existingTarget) {
      if (oldNode.type === 'dir' && existingTarget.type !== 'dir') {
        throw new Error(`ENOTDIR: not a directory, rename '${oldPath}' -> '${newPath}'`);
      }
      if (oldNode.type !== 'dir' && existingTarget.type === 'dir') {
        throw new Error(`EISDIR: illegal operation on a directory, rename '${oldPath}' -> '${newPath}'`);
      }
      // If overwriting a directory, remove all its descendants to avoid orphaned nodes
      if (existingTarget.type === 'dir') {
        const targetPrefix = normNew + '/';
        for (const [p] of Array.from(this.nodes.entries())) {
          if (p === normNew || p.startsWith(targetPrefix)) {
            this.nodes.delete(p);
            this.queueChange(p, null);
          }
        }
      } else {
        this.nodes.delete(normNew);
        this.queueChange(normNew, null);
      }
    }

    if (oldNode.type === 'dir') {
      const oldPrefix = normOld + '/';
      const updates: { old: string; node: VFSNode }[] = [];

      for (const [p, n] of this.nodes.entries()) {
        if (p === normOld) {
          updates.push({
            old: p,
            node: {
              ...n,
              name: newName,
              path: normNew,
              parentPath: newParent,
              modifiedAt: Date.now(),
            },
          });
        } else if (p.startsWith(oldPrefix)) {
          const sub = p.substring(oldPrefix.length);
          const childNewPath = normNew + '/' + sub;
          const childParts = childNewPath.split('/').filter(Boolean);
          const childParent =
            childParts.length === 1 ? '/' : '/' + childParts.slice(0, -1).join('/');

          updates.push({
            old: p,
            node: {
              ...n,
              path: childNewPath,
              parentPath: childParent,
              modifiedAt: Date.now(),
            },
          });
        }
      }

      for (const u of updates) {
        this.nodes.delete(u.old);
        this.queueChange(u.old, null);
        this.nodes.set(u.node.path, u.node);
        this.queueChange(u.node.path, u.node);
      }
    } else {
      this.nodes.delete(normOld);
      this.queueChange(normOld, null);

      const updated: VFSNode = {
        ...oldNode,
        name: newName,
        path: normNew,
        parentPath: newParent,
        mimeType: getMimeType(newName),
        modifiedAt: Date.now(),
      };
      this.nodes.set(normNew, updated);
      this.queueChange(updated.path, updated);
    }

    this.notifyWatchers(normOld, 'move');
    this.notifyWatchers(normNew, 'create');
  }

  public copy(srcPath: string, destPath: string, options?: { recursive?: boolean }): void {
    const normSrc = this.normalizePath(srcPath);
    let normDest = this.normalizePath(destPath);

    if (!this.checkAccess(normSrc, 'r')) {
      throw new Error(`EACCES: permission denied, read '${srcPath}'`);
    }

    const srcNode = this.nodes.get(normSrc);
    if (!srcNode) {
      throw new Error(`ENOENT: no such file or directory, copy '${srcPath}'`);
    }

    // If destination is an existing directory, copy inside it
    if (this.exists(normDest) && this.stat(normDest).isDirectory()) {
      normDest = this.normalizePath(normDest + '/' + srcNode.name);
    }

    if (srcNode.type === 'dir') {
      if (normDest === normSrc || normDest.startsWith(normSrc + '/')) {
        throw new Error(`EINVAL: cannot copy directory '${srcPath}' into itself '${destPath}'`);
      }
      if (!options?.recursive) {
        throw new Error(`EISDIR: -r not specified; omitting directory '${srcPath}'`);
      }
      this.mkdir(normDest, { recursive: true, owner: srcNode.owner, permissions: srcNode.permissions });
      const entries = this.readdir(normSrc);
      for (const entry of entries) {
        this.copy(entry.path, normDest + '/' + entry.name, { recursive: true });
      }
    } else {
      if (srcNode.binaryContent) {
        this.writeBytesSync(normDest, srcNode.binaryContent, {
          owner: srcNode.owner,
          permissions: srcNode.permissions,
          isBinary: srcNode.isBinary,
        });
      } else {
        this.writeFile(normDest, srcNode.content ?? '', {
          owner: srcNode.owner,
          permissions: srcNode.permissions,
          isBinary: srcNode.isBinary,
        });
      }
    }
  }

  public symlink(targetPath: string, linkPath: string): void {
    this.assertWritable();
    const normLink = this.normalizePath(linkPath);
    const parts = normLink.split('/').filter(Boolean);
    const name = parts[parts.length - 1];
    const parentPath = parts.length === 1 ? '/' : '/' + parts.slice(0, -1).join('/');

    if (!this.checkAccess(parentPath, 'w')) {
      throw new Error(`EACCES: permission denied, symlink '${linkPath}'`);
    }

    const node: VFSNode = {
      name,
      path: normLink,
      parentPath,
      type: 'symlink',
      targetPath,
      size: targetPath.length,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      permissions: 0o777,
      owner: this.currentContext.username,
      group: 'aether',
    };

    this.nodes.set(normLink, node);
    this.queueChange(node.path, node);
    this.notifyWatchers(normLink, 'create');
  }

  public readlink(path: string): string {
    const norm = this.normalizePath(path);
    const node = this.getNodeRaw(norm);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, readlink '${path}'`);
    }
    if (node.type !== 'symlink') {
      throw new Error(`EINVAL: invalid argument, readlink '${path}'`);
    }
    return node.targetPath || '';
  }

  public chmod(path: string, mode: number): void {
    this.assertWritable();
    const node = this.nodes.get(this.normalizePath(path));
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, chmod '${path}'`);
    }
    // Only owner or root can change permissions
    if (this.currentContext.uid !== 0 && this.currentContext.username !== node.owner) {
      throw new Error(`EACCES: permission denied, chmod '${path}'`);
    }
    node.permissions = mode;
    node.modifiedAt = Date.now();
    this.queueChange(node.path, node);
    this.notifyWatchers(node.path, 'modify');
  }

  public chown(path: string, owner: string, group?: string): void {
    this.assertWritable();
    const node = this.nodes.get(this.normalizePath(path));
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, chown '${path}'`);
    }
    if (this.currentContext.uid !== 0 && this.currentContext.username !== 'root') {
      throw new Error(`EACCES: operation not permitted, chown requires root privileges`);
    }
    node.owner = owner;
    if (group) node.group = group;
    node.modifiedAt = Date.now();
    this.queueChange(node.path, node);
    this.notifyWatchers(node.path, 'modify');
  }

  public utimes(path: string, mtime = Date.now()): void {
    this.assertWritable();
    const node = this.nodes.get(this.normalizePath(path));
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, utimes '${path}'`);
    }
    node.modifiedAt = mtime;
    this.queueChange(node.path, node);
    this.notifyWatchers(node.path, 'modify');
  }

  // Trash support
  public moveToTrash(path: string): string {
    const norm = this.normalizePath(path);
    const trashBase = '/home/aether/.trash';
    const infoBase = '/home/aether/.trash/.info';
    if (!this.exists(trashBase)) {
      this.mkdir(trashBase, { recursive: true });
    }
    if (!this.exists(infoBase)) {
      this.mkdir(infoBase, { recursive: true });
    }

    const node = this.getNode(norm);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory '${path}'`);
    }

    const id = Date.now();
    const trashDest = this.normalizePath(`${trashBase}/${id}_${node.name}`);
    this.rename(norm, trashDest);

    try {
      this.writeFile(
        `${infoBase}/${id}_${node.name}.json`,
        JSON.stringify({
          originalPath: norm,
          deletedAt: id,
        })
      );
    } catch {
      // Ignore info metadata save error
    }

    return trashDest;
  }

  public restoreFromTrash(trashPath: string): string {
    const norm = this.normalizePath(trashPath);
    if (!this.exists(norm)) {
      throw new Error(`ENOENT: no such file or directory in trash '${trashPath}'`);
    }

    const fileName = norm.split('/').pop()!;
    const infoPath = `/home/aether/.trash/.info/${fileName}.json`;

    let targetPath = '';
    if (this.exists(infoPath)) {
      try {
        const meta = JSON.parse(this.readFile(infoPath));
        if (meta && typeof meta.originalPath === 'string') {
          targetPath = meta.originalPath;
        }
      } catch {
        // Fallback below
      }
    }

    if (!targetPath) {
      const cleanName = fileName.replace(/^\d+_/, '');
      targetPath = this.resolve('/home/aether/Documents', cleanName);
    }

    const targetParent = targetPath.split('/').slice(0, -1).join('/') || '/';
    if (!this.exists(targetParent)) {
      this.mkdir(targetParent, { recursive: true });
    }

    this.rename(norm, targetPath);

    if (this.exists(infoPath)) {
      try {
        this.unlink(infoPath);
      } catch {
        // Ignore
      }
    }

    return targetPath;
  }

  public emptyTrash(): number {
    const trashBase = '/home/aether/.trash';
    if (!this.exists(trashBase)) return 0;

    const items = this.readdir(trashBase);
    let count = 0;
    for (const item of items) {
      if (item.name === '.info') continue;
      if (item.type === 'dir') {
        this.rmdir(item.path, { recursive: true });
      } else {
        this.unlink(item.path);
      }
      count++;
    }

    if (this.exists('/home/aether/.trash/.info')) {
      try {
        this.rmdir('/home/aether/.trash/.info', { recursive: true });
        this.mkdir('/home/aether/.trash/.info', { recursive: true });
      } catch {
        // Ignore
      }
    }

    return count;
  }

  // Watchers & System Events
  public watch(pathOrPrefix: string, callback: VFSWatchCallback): () => void {
    const norm = this.normalizePath(pathOrPrefix);
    if (!this.watchers.has(norm)) {
      this.watchers.set(norm, new Set());
    }
    this.watchers.get(norm)!.add(callback);

    return () => {
      const set = this.watchers.get(norm);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.watchers.delete(norm);
      }
    };
  }

  private notifyWatchers(path: string, operation: 'create' | 'modify' | 'delete' | 'move'): void {
    if (this.batch) {
      this.batch.events.push({ path, operation });
      return;
    }
    systemEventBus.emit('filesystem:changed', { path, operation });

    for (const [watchPath, callbacks] of this.watchers.entries()) {
      if (path === watchPath || path.startsWith(watchPath === '/' ? '/' : watchPath + '/')) {
        for (const cb of callbacks) {
          try {
            cb({ path, operation });
          } catch (err) {
            console.error('Error in VFS watch callback:', err);
          }
        }
      }
    }
  }

  // AetherFS 2.0 Backups & Integrity Recovery
  public async createBackup(): Promise<VFSBackupData> {
    const exportNodes: Array<Omit<VFSNode, 'binaryContent'> & { binaryBase64?: string }> = [];
    for (const node of this.nodes.values()) {
      if (node.path.startsWith('/proc') || node.path.startsWith('/dev')) continue;
      const { binaryContent, ...rest } = node;
      let binaryBase64: string | undefined;
      if (binaryContent) {
        let binaryStr = '';
        const len = binaryContent.byteLength;
        for (let i = 0; i < len; i++) {
          binaryStr += String.fromCharCode(binaryContent[i]);
        }
        binaryBase64 = btoa(binaryStr);
      }
      exportNodes.push({ ...rest, binaryBase64 });
    }

    const payload = JSON.stringify(exportNodes);
    const checksum = await computeSha256(payload);

    const backup: VFSBackupData = {
      version: 2,
      createdAt: Date.now(),
      filesCount: exportNodes.length,
      nodeCount: exportNodes.length,
      checksum,
      nodes: exportNodes,
    };

    return backup;
  }

  public async restoreBackup(
    backupInput: string | VFSBackupData
  ): Promise<boolean> {
    try {
      const parsed: VFSBackupData =
        typeof backupInput === 'string' ? JSON.parse(backupInput) : backupInput;

      if (!parsed || (parsed.version !== 2 && parsed.version !== '2.0') || !Array.isArray(parsed.nodes)) {
        return false;
      }

      // Checksum verification
      const payload = JSON.stringify(parsed.nodes);
      const calculatedChecksum = await computeSha256(payload);
      if (parsed.checksum && parsed.checksum !== calculatedChecksum) {
        return false;
      }

      await this.replaceNodes(parsed.nodes.map(({ binaryBase64, ...node }) => ({
        ...node,
        binaryContent: binaryBase64 === undefined ? undefined : Uint8Array.from(atob(binaryBase64), (char) => char.charCodeAt(0)),
      })));
      return true;
    } catch {
      return false;
    }
  }

  // System snapshot export & import (legacy support)
  public exportSnapshot(): string {
    const list = Array.from(this.nodes.values()).filter(
      (n) => !n.path.startsWith('/proc') && !n.path.startsWith('/dev')
    );
    return JSON.stringify(list, null, 2);
  }

  public async importSnapshot(jsonString: string): Promise<number> {
    const items: VFSNode[] = JSON.parse(jsonString);
    if (!Array.isArray(items)) {
      throw new Error('Invalid snapshot format: expected array of nodes');
    }

    await this.replaceNodes(items.map((node) => {
      const bytes = node.binaryContent;
      if (!bytes || bytes instanceof Uint8Array) return node;
      return { ...node, binaryContent: Uint8Array.from(Object.values(bytes)) };
    }));
    return items.length;
  }

  public async resetFileSystem(): Promise<void> {
    await this.replaceNodes(createDefaultFileSystem().values());
  }

  private async replaceNodes(items: Iterable<VFSNode>): Promise<void> {
    this.assertWritable();
    const replacement = new Map<string, VFSNode>();
    for (const node of items) {
      if (!isStoredNode(node) || replacement.has(node.path)) throw new Error('Invalid or duplicate snapshot node');
      replacement.set(node.path, node);
    }
    if (replacement.get('/')?.type !== 'dir') throw new Error('Snapshot has no root directory');
    this.replacing = true;
    try {
      if (!await idbStorage.replaceAll(replacement.values())) throw new Error('Could not persist the filesystem snapshot');
      this.nodes = replacement;
    } finally {
      this.replacing = false;
    }
    this.notifyWatchers('/', 'modify');
  }

  public getAllNodes(): VFSNode[] {
    return Array.from(this.nodes.values());
  }
}

export const vfs = new VirtualFileSystem();
