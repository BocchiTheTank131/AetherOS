// AetherOS - Secure .aepkg Package Archive Compressor & Decompressor
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

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
  if (!rawPath || typeof rawPath !== 'string') return false;
  if (rawPath.includes('\0')) return false;

  const normalized = rawPath.replace(/\\/g, '/');

  // Must not start with / or drive letters
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return false;
  }

  // Must not contain .. segments
  const segments = normalized.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '') {
      // Empty segment might happen if trailing slash (directory)
      continue;
    }
    if (seg === '.') continue;
  }

  if (segments.some((s) => s === '..')) {
    return false;
  }

  return true;
}

export class PackageArchive {
  /**
   * Decompresses and validates a .aepkg ZIP archive buffer into safe relative paths.
   */
  public static async unpack(data: Uint8Array): Promise<Map<string, Uint8Array>> {
    if (!data || data.byteLength === 0) {
      throw new PackageArchiveError('Archive data is empty');
    }

    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(data);
    } catch (err) {
      throw new PackageArchiveError(`Failed to parse ZIP archive: ${String(err)}`);
    }

    const fileMap = new Map<string, Uint8Array>();
    let totalBytes = 0;
    let fileCount = 0;

    for (const [rawPath, content] of Object.entries(unzipped)) {
      // Ignore directory entries ending with /
      if (rawPath.endsWith('/')) continue;

      const normPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');

      if (!isSafeArchivePath(normPath)) {
        throw new PackageArchiveError(`Archive contains forbidden or unsafe path: '${rawPath}'`);
      }

      fileCount++;
      if (fileCount > ARCHIVE_LIMITS.maxFiles) {
        throw new PackageArchiveError(
          `Archive exceeds maximum file count limit (${ARCHIVE_LIMITS.maxFiles})`
        );
      }

      const size = content.byteLength;
      if (size > ARCHIVE_LIMITS.maxSingleFileBytes) {
        throw new PackageArchiveError(
          `Archive contains file '${normPath}' exceeding max single file size limit`
        );
      }

      totalBytes += size;
      if (totalBytes > ARCHIVE_LIMITS.maxTotalBytes) {
        throw new PackageArchiveError(
          `Archive uncompressed size exceeds max limit (${ARCHIVE_LIMITS.maxTotalBytes} bytes)`
        );
      }

      fileMap.set(normPath, content);
    }

    // Zip bomb compression ratio guard
    if (data.byteLength > 0) {
      const ratio = totalBytes / data.byteLength;
      if (ratio > ARCHIVE_LIMITS.maxDecompressionRatio && totalBytes > 1024 * 1024) {
        throw new PackageArchiveError(
          `Excessive decompression ratio detected (${ratio.toFixed(1)}:1)`
        );
      }
    }

    return fileMap;
  }

  /**
   * Packs a map of files into a .aepkg ZIP archive buffer.
   */
  public static async pack(files: Map<string, Uint8Array | string>): Promise<Uint8Array> {
    const zipEntries: Record<string, Uint8Array> = {};

    for (const [path, content] of files.entries()) {
      const normPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!isSafeArchivePath(normPath)) {
        throw new PackageArchiveError(`Cannot pack invalid path: '${path}'`);
      }
      if (typeof content === 'string') {
        zipEntries[normPath] = strToU8(content);
      } else {
        zipEntries[normPath] = content;
      }
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
    const norm = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const data = files.get(norm);
    if (!data) {
      throw new PackageArchiveError(`File not found in archive: '${filePath}'`);
    }
    return strFromU8(data);
  }
}
