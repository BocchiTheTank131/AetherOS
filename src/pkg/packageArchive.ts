// AetherOS - Secure .aepkg Package Archive Compressor & Decompressor
import { deflateSync, type Zippable, Unzip, UnzipInflate, unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { relativeFilePath } from '../vfs/safePath';

export const ARCHIVE_LIMITS = {
  maxFiles: 500,
  maxTotalBytes: 50 * 1024 * 1024, // 50MB
  maxSingleFileBytes: 20 * 1024 * 1024, // 20MB
  maxDecompressionRatio: 100, // 100:1
} as const;

export class PackageArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageArchiveError';
  }
}

/**
 * Validates whether an archive path is safe from directory traversal.
 */
export function isSafeArchivePath(rawPath: string): boolean {
  try {
    relativeFilePath(rawPath);
    return true;
  } catch {
    return false;
  }
}

export class PackageArchive {
  /**
   * Decompresses and validates a .aepkg ZIP archive buffer into safe relative paths.
   */
  public static async unpack(data: Uint8Array): Promise<Map<string, Uint8Array>> {
    if (!(data instanceof Uint8Array) || data.byteLength < 22 ||
        data.byteLength > ARCHIVE_LIMITS.maxTotalBytes + 1024 * 1024) {
      throw new PackageArchiveError('Invalid or oversized ZIP archive');
    }

    const declared = new Map<string, { size: number; directory: boolean; method: number }>();
    let totalBytes = 0;
    try {
      unzipSync(data, { filter: ({ name, size, originalSize, compression }) => {
        const path = relativeFilePath(name);
        const directory = name.endsWith('/') || name.endsWith('\\');
        if (declared.has(path)) throw new PackageArchiveError(`Duplicate archive path: ${path}`);
        totalBytes += originalSize;
        if (declared.size >= ARCHIVE_LIMITS.maxFiles) throw new PackageArchiveError('Archive exceeds file count limit');
        if (totalBytes > ARCHIVE_LIMITS.maxTotalBytes ||
            originalSize > ARCHIVE_LIMITS.maxSingleFileBytes || size > data.length ||
            (compression !== 0 && compression !== 8) ||
            (compression === 0 && size !== originalSize) || (directory && originalSize !== 0) ||
            (originalSize > 64 * 1024 && originalSize > size * ARCHIVE_LIMITS.maxDecompressionRatio)) {
          throw new PackageArchiveError(`Archive extraction limit exceeded or unsupported entry: ${name}`);
        }
        declared.set(path, { size: originalSize, directory, method: compression });
        return false;
      } });

      for (const path of declared.keys()) {
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
          const parent = declared.get(parts.slice(0, i).join('/'));
          if (parent && !parent.directory) throw new PackageArchiveError(`File shadows an archive directory: ${path}`);
        }
      }

      const files = new Map<string, Uint8Array>();
      const pending = new Map(declared);
      const unzip = new Unzip((file) => {
        const path = relativeFilePath(file.name);
        const info = pending.get(path);
        if (!info || info.method !== file.compression) throw new PackageArchiveError(`Invalid ZIP entry: ${path}`);
        pending.delete(path);
        const output = new Uint8Array(info.size);
        let offset = 0;
        file.ondata = (err, bytes, final) => {
          if (err) throw err;
          if (offset + bytes.length > output.length) throw new PackageArchiveError(`ZIP entry exceeds its declared size: ${path}`);
          output.set(bytes, offset);
          offset += bytes.length;
          if (final) {
            if (offset !== info.size) throw new PackageArchiveError(`Truncated ZIP entry: ${path}`);
            if (!info.directory) files.set(path, output);
          }
        };
        file.start();
      });
      unzip.register(UnzipInflate);
      // Small compressed chunks bound each inflate allocation even when headers lie.
      for (let i = 0; i < data.length; i += 8192) {
        const end = Math.min(i + 8192, data.length);
        unzip.push(data.subarray(i, end), end === data.length);
        if (i && i % (512 * 1024) === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (pending.size || files.size !== Array.from(declared.values()).filter((entry) => !entry.directory).length) {
        throw new PackageArchiveError('ZIP directory does not match extracted files');
      }
      return files;
    } catch (err) {
      throw new PackageArchiveError(`Failed to extract ZIP archive: ${String(err)}`);
    }
  }

  /**
   * Packs a map of files into a .aepkg ZIP archive buffer.
   */
  public static async pack(files: Map<string, Uint8Array | string>): Promise<Uint8Array> {
    const zipEntries: Zippable = Object.create(null);

    let totalBytes = 0;
    for (const [path, content] of files) {
      const normPath = relativeFilePath(path);
      if (Object.hasOwn(zipEntries, normPath)) throw new PackageArchiveError(`Duplicate archive path: ${normPath}`);
      const bytes = typeof content === 'string' ? strToU8(content) : content;
      totalBytes += bytes.length;
      if (files.size > ARCHIVE_LIMITS.maxFiles || bytes.length > ARCHIVE_LIMITS.maxSingleFileBytes ||
          totalBytes > ARCHIVE_LIMITS.maxTotalBytes) {
        throw new PackageArchiveError('Package exceeds archive limits');
      }
      zipEntries[normPath] = bytes.length > 64 * 1024 &&
        bytes.length > deflateSync(bytes, { level: 6 }).length * ARCHIVE_LIMITS.maxDecompressionRatio
        ? [bytes, { level: 0 }]
        : bytes;
    }

    try {
      return zipSync(zipEntries, { level: 6 });
    } catch (err) {
      throw new PackageArchiveError(`Failed to pack archive: ${String(err)}`);
    }
  }

  /**
   * Extracts text content of a file from an unpacked file map.
   */
  public static readText(files: Map<string, Uint8Array>, filePath: string): string {
    const norm = relativeFilePath(filePath);
    const data = files.get(norm);
    if (!data) {
      throw new PackageArchiveError(`File not found in archive: '${filePath}'`);
    }
    return strFromU8(data);
  }
}
