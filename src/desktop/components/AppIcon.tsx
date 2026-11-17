import { Activity, AppWindow, AudioLines, BookOpen, Calculator, CloudSun, Code2, FileText, Folder, Globe, Grid2X2, Image, Mic, Package, Palette, ScrollText, Settings, StickyNote, Terminal, Trash2, Bomb } from 'lucide-react';
import type { CSSProperties } from 'react';

const glyphs = {
  Activity: [Activity, 'rgb(155 62 90)'],
  AppWindow: [AppWindow, 'rgb(83 97 126)'],
  BookOpen: [BookOpen, 'rgb(130 87 54)'],
  Bomb: [Bomb, 'rgb(87 83 106)'],
  Calculator: [Calculator, 'rgb(104 93 155)'],
  CloudRain: [CloudSun, 'rgb(49 113 161)'],
  Code2: [Code2, 'rgb(46 103 113)'],
  FileText: [FileText, 'rgb(58 111 159)'],
  Folder: [Folder, 'rgb(48 107 176)'],
  Globe: [Globe, 'rgb(73 91 163)'],
  Grid: [Grid2X2, 'rgb(133 94 57)'],
  Image: [Image, 'rgb(43 113 108)'],
  Mic: [Mic, 'rgb(153 62 102)'],
  Package: [Package, 'rgb(107 79 153)'],
  Palette: [Palette, 'rgb(144 75 118)'],
  PlayCircle: [AudioLines, 'rgb(169 68 86)'],
  ScrollText: [ScrollText, 'rgb(68 110 132)'],
  Settings: [Settings, 'rgb(90 106 128)'],
  StickyNote: [StickyNote, 'rgb(142 99 37)'],
  Terminal: [Terminal, 'rgb(37 59 70)'],
  Trash2: [Trash2, 'rgb(80 101 118)'],
} as const;

const finishes: Record<string, readonly [string, string, string]> = {
  Activity: ['#ffabaa', '#da4163', '#811447'],
  Code2: ['#94ece0', '#208b87', '#164053'],
  FileText: ['#ffffff', '#cde9fd', '#84add5'],
  Folder: ['#a3e9ff', '#3689e9', '#1956b4'],
  Globe: ['#a3dcff', '#536ee4', '#354398'],
  Package: ['#e5b3ff', '#9861dc', '#57389e'],
  Settings: ['#d9deed', '#737e96', '#384457'],
  Terminal: ['#51677b', '#172b39', '#0e1520'],
  Trash2: ['#cae5f3', '#728d9e', '#3d5566'],
};

export function AppIcon({ name, size = 22, tile = false }: { name: string; size?: number; tile?: boolean }) {
  const [Glyph, tint] = Object.hasOwn(glyphs, name) ? glyphs[name as keyof typeof glyphs] : glyphs.AppWindow;
  const icon = name.startsWith('data:') || name.includes('/')
    ? <img src={name} width={size} height={size} alt="" className="object-contain" />
    : <Glyph size={size} strokeWidth={1.65} aria-hidden="true" />;
  if (!tile) return <span className="app-glyph">{icon}</span>;
  const [light, pigment, shadow] = finishes[name] ?? [
    `color-mix(in srgb, ${tint} 55%, white)`, tint, `color-mix(in srgb, ${tint} 62%, black)`,
  ];
  return (
    <span className="app-tile" data-icon={name in finishes ? name : undefined}
      style={{ backgroundColor: tint, '--icon-light': light, '--icon-pigment': pigment, '--icon-shadow': shadow } as CSSProperties}>
      {icon}
    </span>
  );
}
