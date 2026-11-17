import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Lock, Palette, Power, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useSystem } from '../../core/context';
import { dialogService } from '../../core/dialog';
import { audioService } from '../../core/audio';
import { AppearanceStyleControl, ColorModeControl } from './AppearanceControls';
import { GlassLens } from './GlassLens';

export function QuickSettings() {
  const { quickSettingsOpen } = useSystem();
  return quickSettingsOpen ? <QuickSettingsPanel /> : null;
}

function QuickSettingsPanel() {
  const { glassEffects, setQuickSettingsOpen, setIsLocked, rebootSystem, shutdownSystem } = useSystem();
  const [volume, setVolume] = useState(() => audioService.getVolume());
  const [muted, setMuted] = useState(() => audioService.isSoundMuted());
  const panel = useRef<HTMLElement>(null);
  const appearance = useRef<HTMLDivElement>(null);
  const level = muted ? 0 : volume;

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !panel.current?.contains(target) && !target.closest('[title="Quick Settings"], .dock-clock')) {
        setQuickSettingsOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dialogService.isOpen()) {
        setQuickSettingsOpen(false);
        document.querySelector<HTMLButtonElement>('button[title="Quick Settings"]')?.focus();
      }
    };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', escape);
    };
  }, [setQuickSettingsOpen]);

  const powerAction = (action: () => void) => {
    setQuickSettingsOpen(false);
    action();
  };

  return (
    <section ref={panel} className="quick-settings shell-panel shell-panel-end ui-panel" aria-label="Quick Settings">
      <GlassLens surface={appearance} enabled={glassEffects} />
      <header className="quick-heading ui-material glass-thick glass-rim"><h2>Quick Settings</h2></header>
      <div className="quick-settings-body">
        <div ref={appearance} className="quick-group quick-appearance ui-material glass-thick glass-rim">
          <header><Palette size={19} aria-hidden="true" /><h3>Appearance</h3></header>
          <AppearanceStyleControl />
          <ColorModeControl />
        </div>
        <div className="quick-volume">
          <div className="glass-slider ui-material glass-clear glass-rim" style={{ '--glass-value': `${level * 100}%` } as CSSProperties}>
            <span className="glass-slider-fill" aria-hidden="true" />
            <span className="glass-slider-value" aria-hidden="true">{Math.round(level * 100)}%</span>
            <input type="range" min="0" max="1" step="0.01" value={level}
              aria-label="System volume" aria-orientation="vertical" aria-valuetext={`${Math.round(level * 100)}%`} onChange={(event) => {
              const next = Number(event.target.value);
              if (audioService.isSoundMuted()) audioService.toggleMute();
              audioService.setVolume(next);
              setVolume(next);
              setMuted(audioService.isSoundMuted());
            }} />
          </div>
          <button className="quick-action ui-material glass-button glass-rim glass-interactive" aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={() => setMuted(audioService.toggleMute())}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
        </div>
        <footer className="quick-actions">
          <button className="quick-action ui-material glass-button glass-rim glass-interactive" onClick={() => powerAction(() => setIsLocked(true))}><Lock size={19} />Lock</button>
          <button className="quick-action ui-material glass-button glass-rim glass-interactive" onClick={() => powerAction(rebootSystem)}><RotateCcw size={19} />Restart</button>
          <button className="quick-action ui-material glass-button glass-rim glass-interactive" onClick={() => powerAction(shutdownSystem)}><Power size={19} />Shut down</button>
        </footer>
      </div>
    </section>
  );
}
