import { vfs } from './vfs';

export function hasControlCharacters(value: string): boolean {
  return value.split('').some((char) => char.charCodeAt(0) < 32);
}

export function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(root === '/' ? root : root + '/');
}

export function relativeFilePath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1024) throw new Error('Invalid file path');
  const path = value.replace(/\\/g, '/');
  if (/^[a-z]:/i.test(path) || path.startsWith('/') || hasControlCharacters(path)) {
    throw new Error(`Unsafe file path: ${value}`);
  }
  const parts = path.split('/');
  if (parts.includes('..')) throw new Error(`Unsafe file path: ${value}`);
  const result = parts.filter((part) => part && part !== '.').join('/');
  if (!result) throw new Error(`Invalid file path: ${value}`);
  return result;
}

export function withoutSymlinks(path: string): string {
  const normalized = vfs.normalizePath(path);
  let current = '';
  for (const part of normalized.split('/').filter(Boolean)) {
    current += '/' + part;
    if (vfs.getNodeRaw(current)?.type === 'symlink') {
      throw new Error(`Symbolic links are forbidden at this boundary: ${current}`);
    }
  }
  return normalized;
}
