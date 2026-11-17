// AetherOS - System Settings Application with Custom Wallpapers & Audio Controls
import React, { useState } from 'react';
import type { AppProps } from '../types';
import { useSystem } from '../../core/context';
import { vfs } from '../../vfs/vfs';
import { AETHER_VERSION } from '../../core/version';
import { DEFAULT_WALLPAPER } from '../../core/appearance';
import { AppearanceStyleControl, ColorModeControl } from '../../desktop/components/AppearanceControls';
import { audioService } from '../../core/audio';
import { dialogService } from '../../core/dialog';
import { permissionManager } from '../../appPlatform/PermissionManager';
import { PERMISSION_METADATA, type PermissionScope } from '../../appPlatform/AppPermissions';
import {
  Palette,
  Monitor,
  HardDrive,
  User,
  Info,
  Check,
  RotateCcw,
  Download,
  Upload,
  Volume2,
  VolumeX,
  Play,
  Image as ImageIcon,
  Shield,
} from 'lucide-react';

const WALLPAPERS = [
  { name: 'Blue Hour', url: '/wallpapers/blue-hour.webp', value: DEFAULT_WALLPAPER },
  {
    name: 'Cosmic Nebula',
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2560&auto=format&fit=crop',
  },
  {
    name: 'Deep Space',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=2560&auto=format&fit=crop',
  },
  {
    name: 'Aurora Borealis',
    url: 'https://images.unsplash.com/photo-1579033461380-adb47c3eb938?q=80&w=2560&auto=format&fit=crop',
  },
  {
    name: 'Cyberpunk Twilight',
    url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?q=80&w=2560&auto=format&fit=crop',
  },
  {
    name: 'Minimal Dark',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2560&auto=format&fit=crop',
  },
];

const ACCENT_COLORS = [
  { name: 'cyan', hex: '#00f2fe', label: 'Cyan' },
  { name: 'violet', hex: '#8b5cf6', label: 'Violet' },
  { name: 'emerald', hex: '#10b981', label: 'Emerald' },
  { name: 'blue', hex: '#548ae8', label: 'Blue' },
  { name: 'amber', hex: '#f59e0b', label: 'Amber' },
  { name: 'rose', hex: '#f43f5e', label: 'Rose' },
];

export const SettingsApp: React.FC<AppProps> = () => {
  const { theme, setTheme, user, setUser, rebootSystem } = useSystem();
  const [activeCategory, setActiveCategory] = useState<
    'appearance' | 'dock' | 'sound' | 'storage' | 'permissions' | 'users' | 'about'
  >('appearance');
  const [displayNameInput, setDisplayNameInput] = useState(user.displayName);
  const [customWpUrl, setCustomWpUrl] = useState('');
  const [isMuted, setIsMuted] = useState(audioService.isSoundMuted());
  const [volume, setVolumeState] = useState(Math.round(audioService.getVolume() * 100));
  const [, setForceUpdate] = useState(0);

  const handleExportBackup = () => {
    const data = vfs.exportSnapshot();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aetheros-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        await vfs.importSnapshot(text);
        await dialogService.alert({
          title: 'Backup Restored',
          message: 'System restored successfully from backup! Restarting session now...',
          level: 'success',
        });
        rebootSystem();
      } catch (err) {
        dialogService.alert({
          title: 'Restore Failed',
          message: `Failed to restore backup: ${(err as Error).message}`,
          level: 'error',
        });
      }
    };
    reader.readAsText(file);
  };

  const handleFactoryReset = async () => {
    const confirmed = await dialogService.confirm({
      title: 'Factory Reset AetherOS',
      message: 'WARNING: Factory Reset will erase all files, user accounts, and configurations in AetherOS. Continue?',
      confirmText: 'Reset Everything',
      danger: true,
    });
    if (confirmed) {
      await vfs.resetFileSystem();
      await dialogService.alert({
        title: 'Reset Complete',
        message: 'AetherOS reset complete. System will reboot now.',
        level: 'info',
      });
      rebootSystem();
    }
  };

  const handleApplyCustomWpUrl = () => {
    if (!customWpUrl.trim()) return;
    setTheme({ wallpaper: customWpUrl.trim() });
  };

  const handleUploadWallpaperFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const targetPath = `/home/aether/Pictures/${file.name}`;
      try {
        if (!vfs.exists('/home/aether/Pictures')) {
          vfs.mkdir('/home/aether/Pictures');
        }
        vfs.writeFile(targetPath, dataUrl, { isBinary: true });
      } catch {
        // Ignore
      }
      setTheme({ wallpaper: targetPath });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleToggleMute = () => {
    const muted = audioService.toggleMute();
    setIsMuted(muted);
  };

  const handleVolumeChange = (newVal: number) => {
    setVolumeState(newVal);
    audioService.setVolume(newVal / 100);
  };

  const handleTestSound = () => {
    audioService.playNotification();
  };

  const categories = [
    { id: 'appearance', title: 'Appearance', Icon: Palette },
    { id: 'dock', title: 'Dock & Panels', Icon: Monitor },
    { id: 'sound', title: 'Sound & Audio', Icon: Volume2 },
    { id: 'storage', title: 'Storage & Backup', Icon: HardDrive },
    { id: 'permissions', title: 'App Permissions', Icon: Shield },
    { id: 'users', title: 'User Accounts', Icon: User },
    { id: 'about', title: 'About AetherOS', Icon: Info },
  ] as const;

  return (
    <div className="settings-app select-none">
      <nav className="settings-nav glass-navigation glass-rim" aria-label="Settings categories">
        {categories.map(({ id, title, Icon }) => (
          <button key={id} aria-pressed={activeCategory === id} onClick={() => setActiveCategory(id)}>
            <Icon size={17} aria-hidden="true" />
            <span>{title}</span>
          </button>
        ))}
      </nav>
      <main className="settings-content">
        {/* APPEARANCE */}
        {activeCategory === 'appearance' && (
          <div className="settings-page">
            <header><h2>Appearance</h2><p>Choose how your desktop and apps look.</p></header>
            <section className="ui-card settings-card">
              <h3>Interface style</h3>
              <AppearanceStyleControl preview />
            </section>
            <section className="ui-card settings-card">
              <h3>Color mode</h3>
              <ColorModeControl />
            </section>
            <section className="ui-card settings-card">
              <h3>Accent color</h3>
              <div className="accent-swatches">
                {ACCENT_COLORS.map(({ name, hex, label }) => (
                  <button key={name} type="button" title={label} aria-label={label} aria-pressed={theme.accentHex === hex}
                    onClick={() => setTheme({ accentColor: name, accentHex: hex })} style={{ '--swatch': hex } as React.CSSProperties}>
                    {theme.accentHex === hex && <Check size={16} />}
                  </button>
                ))}
                <label className="accent-custom">Custom <input type="color" value={theme.accentHex} aria-label="Custom accent color"
                  onChange={(event) => setTheme({ accentColor: 'custom', accentHex: event.target.value })} /></label>
              </div>
            </section>
            <section className="ui-card settings-card">
              <h3>Wallpaper</h3>
              <div className="wallpaper-options">
                {WALLPAPERS.map((wp) => {
                  const value = wp.value ?? wp.url;
                  return (
                    <button key={value} type="button" aria-pressed={theme.wallpaper === value} onClick={() => setTheme({ wallpaper: value })}>
                      <img src={wp.url} alt="" loading="lazy" />
                      <span>{wp.name}</span>
                    </button>
                  );
                })}
              </div>
              <form className="wallpaper-tools" onSubmit={(event) => { event.preventDefault(); handleApplyCustomWpUrl(); }}>
                <input className="ui-input" type="text" aria-label="Wallpaper URL" placeholder="Image URL" value={customWpUrl} onChange={(event) => setCustomWpUrl(event.target.value)} />
                <button className="ui-button" type="submit">Apply URL</button>
                <label className="ui-button wallpaper-upload"><ImageIcon size={15} />Upload
                  <input type="file" className="sr-only" accept="image/*" onChange={handleUploadWallpaperFile} />
                </label>
              </form>
            </section>
            <section className="ui-card settings-card">
              <h3>Effects and readability</h3>
              <label className="setting-row"><span>Glass blur and transparency</span>
                <input className="ui-switch" type="checkbox" checked={theme.blur && theme.transparency}
                  onChange={(event) => setTheme({ blur: event.target.checked, transparency: event.target.checked })} />
              </label>
              <label className="setting-row"><span>Reduce motion</span>
                <input className="ui-switch" type="checkbox" checked={theme.reducedMotion} onChange={(event) => setTheme({ reducedMotion: event.target.checked })} />
              </label>
              <label className="setting-row"><span>Text size</span>
                <select className="ui-input" value={theme.fontSize} onChange={(event) => setTheme({ fontSize: event.target.value as typeof theme.fontSize })}>
                  <option value="small">Small</option><option value="medium">Standard</option><option value="large">Large</option>
                </select>
              </label>
            </section>
          </div>
        )}

        {/* DOCK & PANELS */}
        {activeCategory === 'dock' && (
          <div className="settings-page">
            <header><h2>Dock & Panels</h2><p>Choose where the dock appears and when it stays visible.</p></header>
            <section className="ui-card settings-card">
              <h3>Screen position</h3>
              <div className="ui-segments" role="group" aria-label="Dock position">
                {(['bottom', 'top', 'left'] as const).map((position) => (
                  <button key={position} className="ui-button capitalize" aria-pressed={theme.dockPosition === position}
                    onClick={() => setTheme({ dockPosition: position })}>{position}</button>
                ))}
              </div>
              <label className="setting-row"><span>Automatically hide the dock</span>
                <input type="checkbox" className="ui-switch" checked={theme.dockAutoHide} onChange={(event) => setTheme({ dockAutoHide: event.target.checked })} />
              </label>
            </section>
          </div>
        )}

        {/* SOUND & AUDIO */}
        {activeCategory === 'sound' && (
          <div className="settings-page">
            <div>
              <h2 className="text-lg font-bold text-ink mb-1">Sound & Audio</h2>
              <p className="text-xs text-muted">Synthesizer volume and system sound effects.</p>
            </div>

            <div className="bg-raised p-4 rounded-xl border border-line space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-ink block">System Sound Effects</span>
                  <span className="text-xs text-muted">Boot chime, window snapping, alerts</span>
                </div>
                <button
                  onClick={handleToggleMute}
                  className={`p-2 rounded-lg border flex items-center gap-1.5 text-xs font-semibold ${
                    !isMuted
                      ? 'border-emerald-500 bg-positive/10 text-positive'
                      : 'border-line bg-control text-muted'
                  }`}
                >
                  {!isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  <span>{!isMuted ? 'Enabled' : 'Muted'}</span>
                </button>
              </div>

              <div className="space-y-2 pt-2 border-t border-line">
                <div className="flex justify-between text-xs">
                  <span className="text-secondary">Master Volume</span>
                  <span className="font-mono text-accent">{volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10))}
                  className="w-full accent-action cursor-pointer"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleTestSound}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-control hover:bg-hover text-ink text-xs font-medium"
                >
                  <Play className="w-3.5 h-3.5 text-accent" />
                  <span>Test Notification Tone</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STORAGE & BACKUP */}
        {activeCategory === 'storage' && (
          <div className="settings-page">
            <div>
              <h2 className="text-lg font-bold text-ink mb-1">Storage & System Backup</h2>
              <p className="text-xs text-muted">
                Manage IndexedDB persistent storage, export snapshots, and restore.
              </p>
            </div>

            <div className="ui-card settings-card">
              <label className="text-sm font-semibold text-ink">Filesystem Capacity</label>
              <div className="space-y-2 text-xs text-secondary">
                <div className="flex justify-between">
                  <span>Total Filesystem Nodes:</span>
                  <span className="font-mono text-accent">{vfs.getAllNodes().length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Storage Backend:</span>
                  <span className="font-mono text-positive">IndexedDB (Browser Persistent)</span>
                </div>
              </div>
            </div>

            <div className="ui-card settings-card">
              <label className="text-sm font-semibold text-ink">System Backup & Restore</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportBackup}
                  className="flex items-center gap-2 px-3 py-2 bg-action hover:bg-action text-on-action rounded-lg text-xs font-medium"
                >
                  <Download className="w-4 h-4" />
                  <span>Export System Backup</span>
                </button>
                <label className="flex items-center gap-2 px-3 py-2 bg-control hover:bg-hover text-ink rounded-lg text-xs font-medium cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Restore from Backup</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="bg-danger/10 border border-danger/30 p-4 rounded-xl space-y-2">
              <h3 className="text-sm font-bold text-danger">Factory Reset</h3>
              <p className="text-xs text-secondary">
                Resets the virtual filesystem, wiping all personal files and restoring the default Linux skeleton.
              </p>
              <button
                onClick={handleFactoryReset}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-on-action rounded text-xs font-semibold mt-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Erase All Data & Reset</span>
              </button>
            </div>
          </div>
        )}

        {/* APPLICATION PERMISSIONS */}
        {activeCategory === 'permissions' && (
          <div className="settings-page">
            <div>
              <h2 className="text-lg font-bold text-ink mb-1">Application Permissions</h2>
              <p className="text-xs text-muted">
                Inspect and control granular capabilities granted to installed applications.
              </p>
            </div>

            {permissionManager.getAllRecords().length === 0 ? (
              <div className="bg-raised p-6 rounded-xl border border-line text-center text-xs text-muted">
                No installed applications have requested permissions yet.
              </div>
            ) : (
              permissionManager.getAllRecords().map((rec) => (
                <div key={rec.appId} className="ui-card settings-card">
                  <div className="flex items-center justify-between pb-2 border-b border-line">
                    <div>
                      <h3 className="font-semibold text-ink text-sm">{rec.appId}</h3>
                      <p className="text-[11px] text-muted">
                        Updated: {new Date(rec.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        permissionManager.resetPermissions(rec.appId);
                        setForceUpdate((v) => v + 1);
                      }}
                      className="px-2.5 py-1 text-[11px] rounded bg-control hover:bg-hover text-secondary border border-line transition-colors"
                    >
                      Reset Defaults
                    </button>
                  </div>

                  <div className="space-y-2">
                    {rec.requestedScopes.map((scope) => {
                      const meta = PERMISSION_METADATA[scope as PermissionScope];
                      const isGranted = permissionManager.hasPermission(rec.appId, scope as PermissionScope);
                      return (
                        <div
                          key={scope}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-inset border border-line text-xs"
                        >
                          <div className="pr-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-ink">{meta?.name || scope}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                                  meta?.risk === 'high'
                                    ? 'bg-red-950 text-danger border border-danger/40'
                                    : meta?.risk === 'medium'
                                    ? 'bg-amber-950 text-caution border border-caution/40'
                                    : 'bg-emerald-950 text-positive border border-positive/40'
                                }`}
                              >
                                {meta?.risk || 'low'}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted mt-0.5">
                              {meta?.description || scope}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              if (isGranted) {
                                permissionManager.denyPermission(rec.appId, scope as PermissionScope);
                              } else {
                                permissionManager.grantPermission(rec.appId, scope as PermissionScope, 'always');
                              }
                              setForceUpdate((v) => v + 1);
                            }}
                            className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                              isGranted
                                ? 'bg-positive/80 hover:bg-emerald-500 text-on-action'
                                : 'bg-danger/80 hover:bg-red-500 text-on-action'
                            }`}
                          >
                            {isGranted ? 'Allowed' : 'Denied'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* USERS */}
        {activeCategory === 'users' && (
          <div className="settings-page">
            <div>
              <h2 className="text-lg font-bold text-ink mb-1">User Accounts</h2>
              <p className="text-xs text-muted">Manage user profile information and permissions.</p>
            </div>

            <div className="bg-raised p-4 rounded-xl border border-line space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-selection border-2 border-accent flex items-center justify-center text-accent font-bold text-xl">
                  {user.displayName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-ink">{user.displayName}</h3>
                  <p className="text-xs text-muted">
                    @{user.username} &bull; <span className="text-accent uppercase">{user.role}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-line">
                <div>
                  <label className="text-xs text-muted block mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    className="w-full bg-canvas border border-line rounded-lg p-2 text-xs text-ink outline-none focus:border-accent"
                  />
                </div>
                <button
                  onClick={() => setUser({ displayName: displayNameInput })}
                  className="px-3 py-1.5 bg-action hover:bg-action text-on-action rounded-lg text-xs font-medium"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABOUT */}
        {activeCategory === 'about' && (
          <div className="settings-page">
            <div>
              <h2 className="text-lg font-bold text-ink mb-1">About AetherOS</h2>
              <p className="text-xs text-muted">High-fidelity web-standard virtual operating system.</p>
            </div>

            <div className="bg-raised p-4 rounded-xl border border-line space-y-3 text-xs text-secondary">
              <div className="flex justify-between py-1 border-b border-line">
                <span>OS Name:</span>
                <span className="font-semibold text-ink">AetherOS</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span>Version:</span>
                <span className="font-mono text-accent">v{AETHER_VERSION.version} ({AETHER_VERSION.codename})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span>Virtual Kernel:</span>
                <span className="font-mono text-accent">{AETHER_VERSION.kernel} (AetherCore)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span>Architecture:</span>
                <span className="font-mono text-ink">{AETHER_VERSION.architecture}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span>Compositor:</span>
                <span className="font-mono text-ink">{AETHER_VERSION.compositor}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span>Shell:</span>
                <span className="font-mono text-ink">{AETHER_VERSION.shell}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span>Execution Runtime:</span>
                <span className="font-mono text-iris">{AETHER_VERSION.runtime}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span>Virtual Filesystem:</span>
                <span className="font-mono text-aqua">{AETHER_VERSION.vfs}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Persistence:</span>
                <span className="font-mono text-positive">IndexedDB Persistent Store</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
