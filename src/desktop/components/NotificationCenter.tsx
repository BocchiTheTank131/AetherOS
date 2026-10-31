// AetherOS - Notification Center & Toast Popups Component
import React, { useEffect } from 'react';
import { useSystem } from '../../core/context';
import type { SystemNotification } from '../../core/types';
import { Bell, X, CheckCircle2, AlertTriangle, AlertCircle, Info, Trash2 } from 'lucide-react';

const getIcon = (level: string) => {
  switch (level) {
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-400" />;
    default:
      return <Info className="w-4 h-4 text-cyan-400" />;
  }
};

interface ToastProps {
  notif: SystemNotification;
  onDismiss: (id: string) => void;
  blur: boolean;
}

const NotificationToast: React.FC<ToastProps> = ({ notif, onDismiss, blur }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notif.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notif.id, onDismiss]);

  return (
    <div
      className={`pointer-events-auto p-3 rounded-xl border border-gray-700/80 shadow-2xl transition-all duration-200 ${
        blur ? 'glass-panel' : 'bg-[#181f2e]'
      } flex items-start gap-3`}
    >
      <div className="mt-0.5">{getIcon(notif.level)}</div>
      <div className="flex-1 text-xs">
        <div className="font-bold text-white mb-0.5">{notif.title}</div>
        <div className="text-gray-300 leading-snug">{notif.message}</div>
      </div>
      <button
        onClick={() => onDismiss(notif.id)}
        className="p-1 text-gray-400 hover:text-white rounded"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const NotificationCenter: React.FC = () => {
  const {
    notifications,
    dismissNotification,
    clearNotifications,
    notificationCenterOpen,
    setNotificationCenterOpen,
    theme,
  } = useSystem();

  const isTopDock = theme.dockPosition === 'top';

  return (
    <>
      {/* Floating Active Toasts (last 3 recent) */}
      <div
        className={`fixed ${
          isTopDock ? 'top-14' : 'bottom-14'
        } right-4 z-[9998] flex flex-col gap-2 pointer-events-none select-none max-w-sm`}
      >
        {notifications.slice(0, 3).map((notif) => (
          <NotificationToast
            key={notif.id}
            notif={notif}
            onDismiss={dismissNotification}
            blur={theme.blur}
          />
        ))}
      </div>

      {/* Slide-out Full Notification Drawer */}
      {notificationCenterOpen && (
        <div
          className={`fixed right-4 ${
            isTopDock ? 'top-14' : 'bottom-14'
          } z-[9995] w-80 max-h-[500px] select-none rounded-2xl border border-gray-700/80 shadow-2xl flex flex-col overflow-hidden ${
            theme.blur ? 'glass-panel' : 'bg-[#141926]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-700/60 bg-[#161c2b]/70">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-white text-xs">Notifications</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 font-mono">
                {notifications.length}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <button
                  onClick={clearNotifications}
                  className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800"
                  title="Clear All"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setNotificationCenterOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-xs">
                No new notifications
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="p-2.5 rounded-xl bg-gray-800/40 border border-gray-700/50 flex items-start justify-between gap-2 text-xs"
                >
                  <div className="flex items-start gap-2.5 truncate">
                    <div className="mt-0.5">{getIcon(notif.level)}</div>
                    <div>
                      <div className="font-semibold text-white">{notif.title}</div>
                      <div className="text-gray-300 text-[11px] leading-snug mt-0.5">
                        {notif.message}
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono mt-1 block">
                        {new Date(notif.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => dismissNotification(notif.id)}
                    className="p-1 text-gray-400 hover:text-white rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
};
