import { relativeFilePath, withoutSymlinks } from '../../vfs/safePath';
import { vfs } from '../../vfs/vfs';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 1000;

function checkPath(path: string): string {
  const safe = relativeFilePath(path);
  if (safe !== path || safe.split('/').length > 32) throw new Error(`Invalid Python workspace path: ${path}`);
  return safe;
}

function ignored(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.') || part === 'dist' ||
    part === '__pycache__' || part === 'node_modules');
}

function sameBytes(left?: Uint8Array, right?: Uint8Array): boolean {
  return left === right || Boolean(left && right && left.length === right.length && left.every((byte, i) => byte === right[i]));
}

type FileMap = Record<string, Uint8Array>;

export class PythonFileBridge {
  public static loadProjectFiles(cwd: string): FileMap {
    const root = withoutSymlinks(cwd);
    const files: FileMap = Object.create(null);
    if (!vfs.exists(root)) return files;
    const dirs = [root];
    let size = 0;
    let count = 0;
    for (const dir of dirs) {
      for (const entry of vfs.readdir(dir)) {
        const path = entry.path.slice(root === '/' ? 1 : root.length + 1);
        if (ignored(path) || entry.type === 'symlink') continue;
        checkPath(path);
        if (++count > MAX_FILES || size + entry.size > MAX_BYTES) {
          throw new Error('Python workspace exceeds the transfer limit (1,000 paths or 20 MiB)');
        }
        if (entry.type === 'dir') dirs.push(entry.path);
        else {
          const content = vfs.readBytes(entry.path);
          size += content.length;
          files[path] = content;
        }
      }
    }
    return files;
  }

  public static validateFiles(inputs: Record<string, Uint8Array | string>): FileMap {
    if (Object.keys(inputs).length > MAX_FILES) throw new Error('Python file count limit exceeded');
    const files: FileMap = Object.create(null);
    let size = 0;
    for (const [path, content] of Object.entries(inputs)) {
      checkPath(path);
      if (ignored(path)) continue;
      const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      if (!(data instanceof Uint8Array) || (size += data.length) > MAX_BYTES) {
        throw new Error('Invalid or oversized Python filesystem payload');
      }
      files[path] = data;
    }
    return files;
  }

  public static commitFiles(cwd: string, input: FileMap, output: FileMap, baseline = input): FileMap {
    const root = withoutSymlinks(cwd);
    const validated = this.validateFiles(output);
    const changed: FileMap = Object.create(null);
    vfs.atomicBatch(() => {
      for (const path of new Set([...Object.keys(input), ...Object.keys(validated)])) {
        const next = validated[path];
        if (sameBytes(input[path], next)) continue;
        const dest = withoutSymlinks(vfs.resolve(root, path));
        const existing = vfs.exists(dest) ? vfs.readBytes(dest) : undefined;
        if (!sameBytes(baseline[path], existing)) throw new Error(`Python filesystem conflict: ${dest} changed while the program ran`);
        if (!vfs.checkAccess(dest, 'w')) throw new Error(`Python cannot write to ${dest}`);
        if (next) {
          vfs.mkdir(dest.slice(0, dest.lastIndexOf('/')) || '/', { recursive: true });
          vfs.writeBytesSync(dest, next);
          changed[path] = next;
        } else if (existing) vfs.unlink(dest);
      }
    });
    return changed;
  }
}
