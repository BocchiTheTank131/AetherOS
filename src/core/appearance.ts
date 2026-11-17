import type { SystemTheme } from './types';

export const DEFAULT_WALLPAPER = 'aether:blue-hour';

export const APPEARANCE_STYLES = [
  { value: 'liquid-glass', label: 'Liquid Glass' },
  { value: 'modern', label: 'Modern' },
] as const;

export const COLOR_MODES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function normalizeTheme(theme: SystemTheme): SystemTheme {
  return {
    ...theme,
    appearance: theme.appearance === 'modern' ? 'modern' : 'liquid-glass',
    mode: COLOR_MODES.some(({ value }) => value === theme.mode) ? theme.mode : 'dark',
    accentHex: /^#[\da-f]{6}$/i.test(theme.accentHex) ? theme.accentHex : '#548ae8',
    wallpaper: typeof theme.wallpaper === 'string' && theme.wallpaper ? theme.wallpaper : DEFAULT_WALLPAPER,
    dockPosition: theme.dockPosition === 'left' || theme.dockPosition === 'top' ? theme.dockPosition : 'bottom',
  };
}

type RGB = [number, number, number];

function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((channel) => {
    const srgb = channel / 255;
    return srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b;
}

function accessibleTint(accent: RGB, background: RGB, toward: number): string {
  const base = luminance(background);
  let tint = accent;
  for (let step = 1; step <= 10; step++) {
    const value = luminance(tint);
    if ((Math.max(value, base) + .05) / (Math.min(value, base) + .05) >= 4.5) break;
    tint = accent.map((channel) => Math.round(channel + (toward - channel) * step / 10)) as RGB;
  }
  return `rgb(${tint.join(' ')})`;
}

export function accentPalette(hex: string) {
  const color = Number.parseInt(hex.slice(1), 16);
  const accent: RGB = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  return {
    light: accessibleTint(accent, [217, 226, 241], 0),
    dark: accessibleTint(accent, [58, 70, 88], 255),
    action: accessibleTint(accent, [255, 255, 255], 0),
  };
}
