// AetherOS - Python AetherFS File Bridge
import { vfs } from '../../vfs/vfs';

export class PythonFileBridge {
  /**
   * Loads all eligible project files from AetherFS for Python execution.
   */
  public static loadProjectFiles(cwd: string): Record<string, Uint8Array> {
    const files: Record<string, Uint8Array> = {};
    const normCwd = vfs.normalizePath(cwd);

    if (!vfs.exists(normCwd)) return files;

    const scan = (dir: string, prefix: string) => {
      try {
        const entries = vfs.readdir(dir);
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'dist' || entry.name === '__pycache__') {
            continue;
          }
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.type === 'file') {
            try {
              files[relPath] = vfs.readBytes(entry.path);
            } catch {}
          } else if (entry.type === 'dir') {
            scan(entry.path, relPath);
          }
        }
      } catch {}
    };

    scan(normCwd, '');
    return files;
  }

  /**
   * Commits modified or new files written by Python back into AetherFS.
   */
  public static async commitFiles(
    cwd: string,
    modifiedFiles: Record<string, Uint8Array | string>
  ): Promise<string[]> {
    const normCwd = vfs.normalizePath(cwd);
    const saved: string[] = [];

    for (const [relPath, content] of Object.entries(modifiedFiles)) {
      if (relPath.startsWith('.') || relPath.startsWith('dist/')) continue;
      const targetAbs = `${normCwd}/${relPath}`;
      const parts = targetAbs.split('/');
      const parentDir = parts.slice(0, -1).join('/') || '/';

      if (!vfs.exists(parentDir)) {
        vfs.mkdir(parentDir, { recursive: true });
      }

      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
      await vfs.writeBytes(targetAbs, bytes);
      saved.push(targetAbs);
    }

    return saved;
  }
}
