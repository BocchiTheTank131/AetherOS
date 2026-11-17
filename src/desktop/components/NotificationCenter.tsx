import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Bell, CheckCircle2, Info, Trash2, X } from 'lucide-react';
import { useSystem } from '../../core/context';
import type { SystemNotification } from '../../core/types';

const levels = { success: CheckCircle2, warning: AlertTriangle, error: AlertCircle, info: Info };

function Notification({ item, toast = false, dismiss }: { item: SystemNotification; toast?: boolean; dismiss: (id: string) => void }) {
  const Icon = levels[item.level] ?? Info;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dismiss(item.id), 5000);
    return () => clearTimeout(timer);
  }, [toast, dismiss, item.id]);

  return (
    <article className={`notification-item ${toast ? 'ui-panel ui-material notification-toast' : 'ui-card'}`} data-level={item.level} role={toast ? 'status' : undefined}>
      <span className="notification-icon"><Icon size={17} /></span>
      <div className="notification-message">
        <h3>{item.title}</h3>
        <p>{item.message}</p>
        {!toast && <time>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}
      </div>
      <button className="dock-system-button" aria-label={`Dismiss ${item.title}`} onClick={() => dismiss(item.id)}><X size={15} /></button>
    </article>
  );
}

export function NotificationCenter() {
  const { notifications, dismissNotification, clearNotifications, notificationCenterOpen, setNotificationCenterOpen } = useSystem();
  const [dismissedToasts, setDismissedToasts] = useState<Set<string>>(() => new Set());
  const dismissToast = useCallback((id: string) => setDismissedToasts((current) => new Set([...current, id])), []);
  const active = notifications.filter((item) => !dismissedToasts.has(item.id)).slice(0, 3);

  if (notificationCenterOpen) {
    return (
      <section aria-label="Notifications" className="notification-center shell-panel shell-panel-end ui-panel ui-material" onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        setNotificationCenterOpen(false);
        document.querySelector<HTMLButtonElement>('button[title="Notifications"]')?.focus();
      }}>
        <header className="panel-heading">
          <Bell size={18} className="text-accent" /><h2 className="flex-1">Notifications</h2>
          {notifications.length > 0 && <button className="dock-system-button" aria-label="Clear all notifications" title="Clear All" onClick={clearNotifications}><Trash2 size={17} /></button>}
          <button className="dock-system-button" aria-label="Close notifications" onClick={() => setNotificationCenterOpen(false)}><X size={17} /></button>
        </header>
        <div className="notification-list">
          {notifications.length
            ? notifications.map((item) => <Notification key={item.id} item={item} dismiss={(id) => { dismissToast(id); dismissNotification(id); }} />)
            : <div className="notification-empty"><Bell size={26} strokeWidth={1.4} /><p>No new notifications</p></div>}
        </div>
      </section>
    );
  }

  return (
    <div className="notification-stack shell-panel shell-panel-end">
      {active.map((item) => <Notification key={item.id} item={item} toast dismiss={dismissToast} />)}
    </div>
  );
}
