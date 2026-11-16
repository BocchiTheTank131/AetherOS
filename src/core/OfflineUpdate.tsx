import { useEffect, useState } from 'react';
import { dialogService } from './dialog';
import { vfs } from '../vfs/vfs';
import { idbStorage } from '../vfs/idbStorage';

export function OfflineUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    const check = () => {
      if (active && registration?.active && registration.waiting) setWaiting(registration.waiting);
    };
    const observe = () => registration?.installing?.addEventListener('statechange', check);
    const update = () => { if (!document.hidden) void registration?.update().catch(() => {}); };
    document.addEventListener('visibilitychange', update);
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
      if (!active) return;
      registration = reg;
      reg.addEventListener('updatefound', observe);
      observe();
      check();
    }).catch((error: unknown) => console.warn('Offline startup unavailable', error));
    return () => {
      active = false;
      registration?.removeEventListener('updatefound', observe);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  if (!waiting) return null;
  return (
    <button
      className="fixed right-4 top-4 z-[10000] rounded bg-slate-800 px-3 py-2 text-sm text-white shadow-lg"
      disabled={updating}
      onClick={async () => {
        if (!await dialogService.confirm({
          title: 'Install AetherOS update',
          message: 'Save your open work before reloading.',
          confirmText: 'Update and reload',
        })) return;
        setUpdating(true);
        if (!await vfs.flush() && idbStorage.getPersistenceStatus() !== 'unavailable') {
          setUpdating(false);
          await dialogService.alert({ level: 'error', message: 'AetherFS could not save. Update postponed.' });
          return;
        }
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        waiting.postMessage('SKIP_WAITING');
      }}
    >{updating ? 'Installing update…' : 'AetherOS update available'}</button>
  );
}
