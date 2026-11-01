// AetherOS - AetherFS to isomorphic-git Filesystem Bridge Adapter
import { vfs } from '../vfs/vfs';

export interface GitStatObject {
  isFile: () => boolean;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  mode: number;
  ino: number;
  uid: number;
  gid: number;
  dev: number;
}

export class GitFileSystemAdapter {
  public promises = this;

  public async readFile(
    path: string,
    options?: { encoding?: string } | string
  ): Promise<Uint8Array | string> {
    const norm = vfs.normalizePath(path);
    if (!vfs.exists(norm)) {
      const err = new Error(`ENOENT: no such file or directory, open '${path}'`);
      (err as unknown as { code: string }).code = 'ENOENT';
      throw err;
    }

    const bytes = vfs.readBytes(norm);
    const enc = typeof options === 'string' ? options : options?.encoding;
    if (enc === 'utf8' || enc === 'utf-8') {
      return new TextDecoder().decode(bytes);
    }
    return bytes;
  }

  public async writeFile(
    path: string,
    data: Uint8Array | string,
    _options?: unknown
  ): Promise<void> {
    const norm = vfs.normalizePath(path);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    await vfs.writeBytes(norm, bytes);
  }

  public async unlink(path: string): Promise<void> {
    const norm = vfs.normalizePath(path);
    if (!vfs.exists(norm)) {
      const err = new Error(`ENOENT: no such file or directory, unlink '${path}'`);
      (err as unknown as { code: string }).code = 'ENOENT';
      throw err;
    }
    vfs.unlink(norm);
  }

  public async readdir(path: string): Promise<string[]> {
    const norm = vfs.normalizePath(path);
    if (!vfs.exists(norm)) {
      const err = new Error(`ENOENT: no such file or directory, scandir '${path}'`);
      (err as unknown as { code: string }).code = 'ENOENT';
      throw err;
    }
    const entries = vfs.readdir(norm);
    return entries.map((e) => e.name);
  }

  public async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const norm = vfs.normalizePath(path);
    if (vfs.exists(norm)) {
      if (!options?.recursive) {
        const err = new Error(`EEXIST: file already exists, mkdir '${path}'`);
        (err as unknown as { code: string }).code = 'EEXIST';
        throw err;
      }
      return;
    }
    vfs.mkdir(norm, { recursive: true });
  }

  public async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const norm = vfs.normalizePath(path);
    if (!vfs.exists(norm)) {
      const err = new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
      (err as unknown as { code: string }).code = 'ENOENT';
      throw err;
    }
    vfs.rmdir(norm, options);
  }

  public async stat(path: string): Promise<GitStatObject> {
    const norm = vfs.normalizePath(path);
    try {
      const stats = vfs.stat(norm);
      const isDir = stats.isDirectory();
      const isSym = stats.isSymbolicLink();
      const mode = isDir ? 0o040755 : isSym ? 0o120777 : 0o100644;

      return {
        isFile: () => !isDir && !isSym,
        isDirectory: () => isDir,
        isSymbolicLink: () => isSym,
        size: stats.size || 0,
        mtimeMs: stats.modifiedAt || Date.now(),
        ctimeMs: stats.createdAt || Date.now(),
        mode,
        ino: 1,
        uid: 1000,
        gid: 1000,
        dev: 1,
      };
    } catch {
      const err = new Error(`ENOENT: no such file or directory, stat '${path}'`);
      (err as unknown as { code: string }).code = 'ENOENT';
      throw err;
    }
  }

  public async lstat(path: string): Promise<GitStatObject> {
    const norm = vfs.normalizePath(path);
    try {
      const stats = vfs.lstat(norm);
      const isDir = stats.isDirectory();
      const isSym = stats.isSymbolicLink();
      const mode = isDir ? 0o040755 : isSym ? 0o120777 : 0o100644;

      return {
        isFile: () => !isDir && !isSym,
        isDirectory: () => isDir,
        isSymbolicLink: () => isSym,
        size: stats.size || 0,
        mtimeMs: stats.modifiedAt || Date.now(),
        ctimeMs: stats.createdAt || Date.now(),
        mode,
        ino: 1,
        uid: 1000,
        gid: 1000,
        dev: 1,
      };
    } catch {
      const err = new Error(`ENOENT: no such file or directory, lstat '${path}'`);
      (err as unknown as { code: string }).code = 'ENOENT';
      throw err;
    }
  }

  public async readlink(path: string): Promise<string> {
    return vfs.readlink(path);
  }

  public async symlink(target: string, path: string): Promise<void> {
    vfs.symlink(target, path);
  }
}

export const gitFsAdapter = new GitFileSystemAdapter();
