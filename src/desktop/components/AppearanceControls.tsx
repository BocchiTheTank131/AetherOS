import type { CSSProperties } from 'react';
import { APPEARANCE_STYLES, COLOR_MODES } from '../../core/appearance';
import { useSystem } from '../../core/context';
import { Check, Monitor, Moon, Sun } from 'lucide-react';

const modeIcons = { dark: Moon, light: Sun, system: Monitor };

export function ColorModeControl() {
  const { theme, setTheme } = useSystem();
  return (
    <div className="ui-segments glass-segments" role="group" aria-label="Color mode"
      style={{ '--glass-count': COLOR_MODES.length, '--glass-index': COLOR_MODES.findIndex(({ value }) => value === theme.mode) } as CSSProperties}>
      {COLOR_MODES.map(({ value, label }) => {
        const Glyph = modeIcons[value];
        return (
          <button key={value} className="ui-button" aria-pressed={theme.mode === value} onClick={() => setTheme({ mode: value })}>
            <Glyph size={15} aria-hidden="true" />{label}
          </button>
        );
      })}
    </div>
  );
}

export function AppearanceStyleControl({ preview = false }: { preview?: boolean }) {
  const { theme, setTheme } = useSystem();
  return (
    <div className={preview ? 'appearance-previews' : 'ui-segments glass-segments'} role="group" aria-label="Appearance style"
      style={preview ? undefined : { '--glass-count': APPEARANCE_STYLES.length, '--glass-index': APPEARANCE_STYLES.findIndex(({ value }) => value === theme.appearance) } as CSSProperties}>
      {APPEARANCE_STYLES.map(({ value, label }) => (
        <button key={value} className={preview ? 'appearance-preview' : 'ui-button'} aria-pressed={theme.appearance === value} onClick={() => setTheme({ appearance: value })}>
          {preview && (
            <span className="preview-scene" data-preview-style={value} aria-hidden="true">
              <span className="preview-window"><span /><span /><span /></span>
              <span className="preview-dock"><span /><span /><span /></span>
            </span>
          )}
          {preview ? <span className="preview-label">{label}{theme.appearance === value && <Check size={15} aria-hidden="true" />}</span> : label}
        </button>
      ))}
    </div>
  );
}
