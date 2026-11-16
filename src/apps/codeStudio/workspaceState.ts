import { vfs } from '../../vfs/vfs';
import { isWithin } from '../../vfs/safePath';

const SETTINGS = '/home/aether/.config/aetheros/code-studio.json';
export type PreviewSize = 'desktop' | 'tablet' | 'mobile';

interface Workspace {
  openTabs: string[];
  activeFile: string;
  secondaryFile: string;
  split: 'none' | 'horizontal' | 'vertical';
  previewSize: PreviewSize;
  autosave: boolean;
}

function readSettings(): { recent: string; projects: Record<string, Workspace> } {
  try {
    const temporary = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(SETTINGS);
    if (temporary) return JSON.parse(temporary);
  } catch {}
  try { return JSON.parse(vfs.readFile(SETTINGS)); }
  catch { return { recent: '', projects: {} }; }
}

export function lastStudioProject(): string | undefined {
  const root = readSettings()?.recent;
  try {
    if (typeof root === 'string' && vfs.stat(root).isDirectory()) return root;
  } catch {}
}

export function readStudioWorkspace(root: string): Workspace {
  const saved = readSettings()?.projects?.[root];
  const valid = (path: unknown): path is string => typeof path === 'string' && isWithin(path, root) && vfs.exists(path);
  return {
    openTabs: Array.isArray(saved?.openTabs) ? saved.openTabs.filter(valid).slice(0, 50) : [],
    activeFile: valid(saved?.activeFile) ? saved.activeFile : '',
    secondaryFile: valid(saved?.secondaryFile) ? saved.secondaryFile : '',
    split: saved?.split === 'horizontal' || saved?.split === 'vertical' ? saved.split : 'none',
    previewSize: saved?.previewSize === 'tablet' || saved?.previewSize === 'mobile' ? saved.previewSize : 'desktop',
    autosave: saved?.autosave !== false,
  };
}

export function saveStudioWorkspace(root: string, workspace: Workspace): void {
  const recent = Object.entries(readSettings()?.projects ?? {}).filter(([path]) => path !== root).slice(-9);
  vfs.mkdir('/home/aether/.config/aetheros', { recursive: true });
  const payload = JSON.stringify({ recent: root, projects: Object.fromEntries([...recent, [root, workspace]]) });
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SETTINGS, payload); } catch {}
  if (!vfs.exists(SETTINGS) || vfs.readText(SETTINGS) !== payload) vfs.writeText(SETTINGS, payload);
}
