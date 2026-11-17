import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, UserRound } from 'lucide-react';
import { useSystem } from '../../core/context';
import { audioService } from '../../core/audio';
import { wallpaperImage } from './wallpaper';

export function LockScreen() {
  const { isLocked } = useSystem();
  return isLocked ? <LockScreenContent /> : null;
}

function LockScreenContent() {
  const { setIsLocked, user, theme } = useSystem();
  const [time, setTime] = useState(() => new Date());
  const unlock = useRef<HTMLButtonElement>(null);
  const backgroundImage = useMemo(() => wallpaperImage(theme.wallpaper), [theme.wallpaper]);

  useEffect(() => {
    unlock.current?.focus({ preventScroll: true });
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="lock-screen wallpaper-screen" style={{ backgroundImage }} role="dialog" aria-modal="true" aria-label="Locked session">
      <div className="lock-clock">
        <p>{time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <time>{time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
      </div>
      <div className="lock-card ui-material ui-panel">
        <div className="lock-avatar"><UserRound size={27} /></div>
        <h2>{user.displayName}</h2>
        <button ref={unlock} className="ui-button primary" onClick={() => {
          setIsLocked(false);
          audioService.playClick();
        }}>Unlock desktop <ArrowRight size={16} /></button>
      </div>
    </section>
  );
}
