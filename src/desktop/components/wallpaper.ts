import { DEFAULT_WALLPAPER } from '../../core/appearance';
import { vfs } from '../../vfs/vfs';

export function wallpaperImage(wallpaper: string): string {
  if (wallpaper === DEFAULT_WALLPAPER) return 'var(--desktop-wallpaper)';
  let resolved = wallpaper;
  if (wallpaper.startsWith('/')) {
    try {
      resolved = vfs.readFile(wallpaper);
    } catch {
      return 'var(--desktop-wallpaper)';
    }
  }
  return `url(${JSON.stringify(resolved)}), var(--desktop-wallpaper)`;
}
