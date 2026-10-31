// AetherOS - Core Virtual Filesystem (VFS)
import type { VFSNode, VFSEntry, VFSStats, VFSWatchCallback } from './types';
import { getMimeType } from './mime';
import { idbStorage } from './idbStorage';
import { createDefaultFileSystem } from './initFs';
import { systemLogger } from '../core/logger';
import { systemEventBus } from '../core/eventBus';
import { virtualKernel } from '../core/kernel';

export class VirtualFileSystem {
  private nodes = new Map<string, VFSNode>();
  private watchers = new Map<string, Set<VFSWatchCallback>>();
  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await idbStorage.init();
      const storedNodes = await idbStorage.loadAll();

      if (storedNodes.size > 0 && storedNodes.has('/')) {
        this.nodes = storedNodes;
        systemLogger.info('vfs', `Restored existing VFS with ${this.nodes.size} nodes`);
      } else {
        this.nodes = createDefaultFileSystem();
        systemLogger.info('vfs', `Created fresh Linux VFS skeleton with ${this.nodes.size} nodes`);
        // Persist default structure
        for (const node of this.nodes.values()) {
          idbStorage.queueSave(node);
        }
        await idbStorage.flush();
      }
      this.initialized = true;
    } catch (err) {
      systemLogger.error('vfs', `VFS initialization failed: ${String(err)}`);
      this.nodes = createDefaultFileSystem();
      this.initialized = true;
    }
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

    if (norm === '/proc/version') {
      return {
        name: 'version',
        path: norm,
        parentPath: '/proc',
        type: 'file',
        size: 96,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o444,
        owner: 'root',
        group: 'root',
        content: 'Linux version 6.8.0-aether (gcc 13.2.0) #1 SMP PREEMPT_DYNAMIC AetherCore 1.0\n',
      };
    }

    if (norm === '/proc/uptime') {
      const up = virtualKernel.getUptimeSeconds();
      return {
        name: 'uptime',
        path: norm,
        parentPath: '/proc',
        type: 'file',
        size: 32,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o444,
        owner: 'root',
        group: 'root',
        content: `${up}.00 ${Math.floor(up * 0.9)}.00\n`,
      };
    }

    if (norm === '/proc/meminfo') {
      const mem = virtualKernel.getTotalMemoryUsage();
      const content = `MemTotal:       ${mem.totalKb} kB\nMemFree:        ${mem.totalKb - mem.usedKb} kB\nMemAvailable:   ${mem.totalKb - mem.usedKb} kB\nBuffers:           16384 kB\nCached:            65536 kB\nSwapTotal:             0 kB\nSwapFree:              0 kB\n`;
      return {
        name: 'meminfo',
        path: norm,
        parentPath: '/proc',
        type: 'file',
        size: content.length,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o444,
        owner: 'root',
        group: 'root',
        content,
      };
    }

    if (norm === '/proc/cpuinfo') {
      const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
      const content = `processor       : 0\nmodel name      : Aether Virtual Core 3.40GHz\ncpu cores       : ${cores}\nflags           : fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov\n`;
      return {
        name: 'cpuinfo',
        path: norm,
        parentPath: '/proc',
        type: 'file',
        size: content.length,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o444,
        owner: 'root',
        group: 'root',
        content,
      };
    }

    // /dev/null
    if (norm === '/dev/null') {
      return {
        name: 'null',
        path: norm,
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

    // /dev/zero
    if (norm === '/dev/zero') {
      return {
        name: 'zero',
        path: norm,
        parentPath: '/dev',
        type: 'file',
        size: 0,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        permissions: 0o666,
        owner: 'root',
        group: 'root',
        content: '\0',
      };
    }

    // /dev/urandom
    if (norm === '/dev/urandom' || norm === '/dev/random') {
      const randStr = Array.from({ length: 64 }, () =>
        String.fromCharCode(Math.floor(Math.random() * 256))
      ).join('');
      return {
        name: norm.slice(5),
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

  public getNode(path: string): VFSNode | null {
    const norm = this.normalizePath(path);
    const dynamic = this.getDynamicNode(norm);
    if (dynamic) return dynamic;

    const node = this.nodes.get(norm);
    if (!node) return null;

    // Follow symlinks for read/stat operations if not circular
    if (node.type === 'symlink' && node.targetPath) {
      return this.getNode(node.targetPath);
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

  public readFile(path: string): string {
    const norm = this.normalizePath(path);
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
      return this.readFile(node.targetPath);
    }
    return node.content ?? '';
  }

  public writeFile(
    path: string,
    content: string,
    options?: { owner?: string; permissions?: number; isBinary?: boolean }
  ): void {
    const norm = this.normalizePath(path);
    if (norm === '/dev/null') return; // discard

    const parts = norm.split('/').filter(Boolean);
    if (parts.length === 0) {
      throw new Error(`EISDIR: cannot write directly to root directory`);
    }

    const name = parts[parts.length - 1];
    const parentPath = parts.length === 1 ? '/' : '/' + parts.slice(0, -1).join('/');

    // Check parent exists and is directory
    const parent = this.getNode(parentPath);
    if (!parent) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    if (parent.type !== 'dir') {
      throw new Error(`ENOTDIR: not a directory, '${parentPath}'`);
    }

    const existing = this.nodes.get(norm);
    const now = Date.now();
    const size = options?.isBinary
      ? Math.floor(content.length * 0.75)
      : new TextEncoder().encode(content).length;

    const node: VFSNode = {
      name,
      path: norm,
      parentPath,
      type: 'file',
      content,
      size,
      createdAt: existing ? existing.createdAt : now,
      modifiedAt: now,
      permissions: options?.permissions ?? existing?.permissions ?? 0o644,
      owner: options?.owner ?? existing?.owner ?? 'aether',
      group: 'aether',
      mimeType: getMimeType(name),
      isBinary: options?.isBinary ?? existing?.isBinary ?? false,
    };

    this.nodes.set(norm, node);
    idbStorage.queueSave(node);

    this.notifyWatchers(norm, existing ? 'modify' : 'create');
  }

  public appendFile(path: string, content: string): void {
    const norm = this.normalizePath(path);
    if (this.exists(norm)) {
      const existing = this.readFile(norm);
      this.writeFile(norm, existing + content);
    } else {
      this.writeFile(norm, content);
    }
  }

  public mkdir(
    path: string,
    options?: { recursive?: boolean; owner?: string; permissions?: number }
  ): void {
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
        this.mkdir(parentPath, { recursive: true, owner: options.owner });
      } else {
        throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
      }
    } else if (parent.type !== 'dir') {
      throw new Error(`ENOTDIR: not a directory, mkdir '${path}'`);
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
      owner: options?.owner ?? 'aether',
      group: 'aether',
    };

    this.nodes.set(norm, node);
    idbStorage.queueSave(node);

    this.notifyWatchers(norm, 'create');
  }

  public readdir(path: string): VFSEntry[] {
    const norm = this.normalizePath(path);
    const dirNode = this.getNode(norm);
    if (!dirNode) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }
    if (dirNode.type !== 'dir') {
      throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
    }

    // Collect dynamic nodes if in /proc or /dev
    const results: VFSEntry[] = [];

    if (norm === '/proc') {
      const dynamicProcFiles = ['version', 'uptime', 'meminfo', 'cpuinfo'];
      for (const f of dynamicProcFiles) {
        const d = this.getDynamicNode(`/proc/${f}`);
        if (d) {
          results.push({
            name: d.name,
            path: d.path,
            type: d.type,
            size: d.size,
            modifiedAt: d.modifiedAt,
            permissions: d.permissions,
            owner: d.owner,
          });
        }
      }
      return results;
    }

    if (norm === '/dev') {
      const dynamicDevFiles = ['null', 'zero', 'urandom', 'random'];
      for (const f of dynamicDevFiles) {
        const d = this.getDynamicNode(`/dev/${f}`);
        if (d) {
          results.push({
            name: d.name,
            path: d.path,
            type: d.type,
            size: d.size,
            modifiedAt: d.modifiedAt,
            permissions: d.permissions,
            owner: d.owner,
          });
        }
      }
    }

    // Collect children from regular map
    for (const node of this.nodes.values()) {
      if (node.parentPath === norm && node.path !== norm) {
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
    const norm = this.normalizePath(path);
    const node = this.nodes.get(norm);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }
    if (node.type === 'dir') {
      throw new Error(`EISDIR: illegal operation on a directory, unlink '${path}'`);
    }

    this.nodes.delete(norm);
    idbStorage.queueDelete(norm);
    this.notifyWatchers(norm, 'delete');
  }

  public rmdir(path: string, options?: { recursive?: boolean }): void {
    const norm = this.normalizePath(path);
    if (norm === '/') {
      throw new Error(`EBUSY: resource busy or locked, rmdir '/'`);
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
          idbStorage.queueDelete(p);
          this.notifyWatchers(p, 'delete');
        }
      }
    } else {
      this.nodes.delete(norm);
      idbStorage.queueDelete(norm);
      this.notifyWatchers(norm, 'delete');
    }
  }

  public rename(oldPath: string, newPath: string): void {
    const normOld = this.normalizePath(oldPath);
    const normNew = this.normalizePath(newPath);

    if (normOld === normNew) return;
    const oldNode = this.nodes.get(normOld);
    if (!oldNode) {
      throw new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
    }

    const newParts = normNew.split('/').filter(Boolean);
    const newName = newParts[newParts.length - 1];
    const newParent = newParts.length === 1 ? '/' : '/' + newParts.slice(0, -1).join('/');

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
            idbStorage.queueDelete(p);
          }
        }
      } else {
        this.nodes.delete(normNew);
        idbStorage.queueDelete(normNew);
      }
    }

    if (oldNode.type === 'dir') {
      // Rename directory and all descendants
      const oldPrefix = normOld + '/';
      const updates: Array<{ old: string; node: VFSNode }> = [];

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
        idbStorage.queueDelete(u.old);
        this.nodes.set(u.node.path, u.node);
        idbStorage.queueSave(u.node);
      }
    } else {
      this.nodes.delete(normOld);
      idbStorage.queueDelete(normOld);

      const updated: VFSNode = {
        ...oldNode,
        name: newName,
        path: normNew,
        parentPath: newParent,
        mimeType: getMimeType(newName),
        modifiedAt: Date.now(),
      };
      this.nodes.set(normNew, updated);
      idbStorage.queueSave(updated);
    }

    this.notifyWatchers(normOld, 'move');
    this.notifyWatchers(normNew, 'create');
  }

  public copy(srcPath: string, destPath: string, options?: { recursive?: boolean }): void {
    const normSrc = this.normalizePath(srcPath);
    let normDest = this.normalizePath(destPath);

    const srcNode = this.nodes.get(normSrc);
    if (!srcNode) {
      throw new Error(`ENOENT: no such file or directory, copy '${srcPath}'`);
    }

    // If destination is an existing directory, copy inside it
    if (this.exists(normDest) && this.stat(normDest).isDirectory()) {
      normDest = this.normalizePath(normDest + '/' + srcNode.name);
    }

    if (srcNode.type === 'dir') {
      if (!options?.recursive) {
        throw new Error(`EISDIR: -r not specified; omitting directory '${srcPath}'`);
      }
      this.mkdir(normDest, { recursive: true, owner: srcNode.owner, permissions: srcNode.permissions });
      const entries = this.readdir(normSrc);
      for (const entry of entries) {
        this.copy(entry.path, normDest + '/' + entry.name, { recursive: true });
      }
    } else {
      this.writeFile(normDest, srcNode.content ?? '', {
        owner: srcNode.owner,
        permissions: srcNode.permissions,
        isBinary: srcNode.isBinary,
      });
    }
  }

  public symlink(targetPath: string, linkPath: string): void {
    const normLink = this.normalizePath(linkPath);
    const parts = normLink.split('/').filter(Boolean);
    const name = parts[parts.length - 1];
    const parentPath = parts.length === 1 ? '/' : '/' + parts.slice(0, -1).join('/');

    const node: VFSNode = {
      name,
      path: normLink,
      parentPath,
      type: 'symlink',
      targetPath: this.normalizePath(targetPath),
      size: targetPath.length,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      permissions: 0o777,
      owner: 'aether',
      group: 'aether',
    };

    this.nodes.set(normLink, node);
    idbStorage.queueSave(node);
    this.notifyWatchers(normLink, 'create');
  }

  public chmod(path: string, mode: number): void {
    const node = this.nodes.get(this.normalizePath(path));
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, chmod '${path}'`);
    }
    node.permissions = mode;
    node.modifiedAt = Date.now();
    idbStorage.queueSave(node);
    this.notifyWatchers(node.path, 'modify');
  }

  public chown(path: string, owner: string, group?: string): void {
    const node = this.nodes.get(this.normalizePath(path));
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, chown '${path}'`);
    }
    node.owner = owner;
    if (group) node.group = group;
    node.modifiedAt = Date.now();
    idbStorage.queueSave(node);
    this.notifyWatchers(node.path, 'modify');
  }

  // Trash support
  public moveToTrash(path: string): string {
    const norm = this.normalizePath(path);
    const trashBase = '/home/aether/.trash';
    if (!this.exists(trashBase)) {
      this.mkdir(trashBase, { recursive: true });
    }

    const node = this.getNode(norm);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory '${path}'`);
    }

    const trashDest = this.normalizePath(`${trashBase}/${Date.now()}_${node.name}`);
    this.rename(norm, trashDest);
    return trashDest;
  }

  public emptyTrash(): number {
    const trashBase = '/home/aether/.trash';
    if (!this.exists(trashBase)) return 0;

    const items = this.readdir(trashBase);
    for (const item of items) {
      if (item.type === 'dir') {
        this.rmdir(item.path, { recursive: true });
      } else {
        this.unlink(item.path);
      }
    }
    return items.length;
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

  // System snapshot export & import
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

    await idbStorage.clearAll();
    this.nodes.clear();

    for (const item of items) {
      this.nodes.set(item.path, item);
      idbStorage.queueSave(item);
    }
    await idbStorage.flush();
    systemLogger.info('vfs', `Successfully imported snapshot with ${items.length} nodes`);
    return items.length;
  }

  public async resetFileSystem(): Promise<void> {
    await idbStorage.clearAll();
    this.nodes = createDefaultFileSystem();
    for (const node of this.nodes.values()) {
      idbStorage.queueSave(node);
    }
    await idbStorage.flush();
    this.notifyWatchers('/', 'modify');
    systemLogger.info('vfs', 'VFS reset to default Linux skeleton');
  }

  public getAllNodes(): VFSNode[] {
    return Array.from(this.nodes.values());
  }
}

export const vfs = new VirtualFileSystem();
