// AetherOS - Sandboxed Application Host Component
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AppProps } from '../apps/types';
import { dynamicAppRegistry, type InstalledAppRecord } from './DynamicAppRegistry';
import { permissionManager } from './PermissionManager';
import { appStorage } from './AppStorage';
import { SDK_CLIENT_SCRIPT } from './sdk/clientSource';
import {
  type AppRequestMessage,
  type HostResponseMessage,
  type HostEventMessage,
  PROTOCOL_LIMITS,
  isValidAppRequest,
} from './AppProtocol';
import { useSystem } from '../core/context';
import { vfs } from '../vfs/vfs';
import { systemLogger } from '../core/logger';
import { systemEventBus } from '../core/eventBus';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface AppHostProps extends AppProps {
  appId?: string;
  previewRecord?: InstalledAppRecord;
}

export const AppHost: React.FC<AppHostProps> = ({
  windowId: _winId,
  initialProps,
  isFocused,
  onClose,
  setTitle,
  appId: propAppId,
  previewRecord,
}) => {
  const { theme, addNotification } = useSystem();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const channelRef = useRef<MessageChannel | null>(null);
  const blobUrlsToRevoke = useRef<string[]>([]);
  const requestCountRef = useRef<number>(0);
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setTitleRef = useRef(setTitle);

  useEffect(() => {
    setTitleRef.current = setTitle;
  }, [setTitle]);

  const effectiveAppId =
    propAppId ||
    previewRecord?.id ||
    (initialProps?.appId as string) ||
    '';

  const appRecord: InstalledAppRecord | undefined =
    previewRecord ||
    dynamicAppRegistry.get(effectiveAppId) ||
    (initialProps?.record as InstalledAppRecord);

  // Rate limiter counter reset every second
  useEffect(() => {
    rateLimitTimerRef.current = setInterval(() => {
      requestCountRef.current = 0;
    }, 1000);
    return () => {
      if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
    };
  }, []);

  // Prepare and bundle the guest HTML
  const loadApp = useCallback(() => {
    setError(null);
    try {
      if (!appRecord) {
        throw new Error(`Application metadata not found for ID '${effectiveAppId}'`);
      }

      const installDir = appRecord.installDir;
      const entryFile = `${installDir}/${appRecord.entry}`.replace(/\\/g, '/');

      if (!vfs.exists(entryFile)) {
        throw new Error(`Entry file '${appRecord.entry}' not found in ${installDir}`);
      }

      let html = vfs.readFile(entryFile);

      // Inline local scripts: <script src="..."></script>
      html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
          return match;
        }
        const scriptPath = `${installDir}/${src.replace(/^\/+/, '')}`;
        if (vfs.exists(scriptPath)) {
          const scriptContent = vfs.readFile(scriptPath);
          return `<script>\n${scriptContent}\n</script>`;
        }
        return match;
      });

      // Inline local stylesheets: <link rel="stylesheet" href="...">
      html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
          return match;
        }
        const stylePath = `${installDir}/${href.replace(/^\/+/, '')}`;
        if (vfs.exists(stylePath)) {
          const cssContent = vfs.readFile(stylePath);
          return `<style>\n${cssContent}\n</style>`;
        }
        return match;
      });

      // Restrictive CSP Header:
      // default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline' blob:; img-src data: blob:;
      const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline' blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none';">`;

      // SDK script to inject into head
      const sdkTag = `<script>\n${SDK_CLIENT_SCRIPT}\n</script>`;

      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>\n${cspMeta}\n${sdkTag}`);
      } else {
        html = `<!DOCTYPE html><html><head>${cspMeta}${sdkTag}</head><body>${html}</body></html>`;
      }

      // Create Blob URL for sandboxed iframe
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      blobUrlsToRevoke.current.push(url);

      const token = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `token_${Date.now()}_${Math.random()}`;
      setSessionToken(token);
      setBlobUrl(url);

      if (appRecord.name) {
        setTitleRef.current?.(appRecord.name);
      }
    } catch (err) {
      const msg = (err as Error).message || String(err);
      setError(msg);
      systemLogger.error('appHost', `Failed to load app '${effectiveAppId}': ${msg}`);
    }
  }, [appRecord, effectiveAppId]);

  useEffect(() => {
    loadApp();
    return () => {
      // Cleanup all Blob URLs
      for (const url of blobUrlsToRevoke.current) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
      blobUrlsToRevoke.current = [];
      if (channelRef.current) {
        try {
          channelRef.current.port1.close();
        } catch {}
        channelRef.current = null;
      }
    };
  }, [loadApp]);

  // Handle incoming RPC requests from the guest sandbox over MessageChannel
  const handleAppRequest = async (
    req: AppRequestMessage,
    token: string,
    appId: string,
    port: MessagePort
  ) => {
    const sendResponse = (success: boolean, data?: unknown, errorMsg?: string) => {
      const resp: HostResponseMessage = {
        id: req.id,
        type: 'res',
        success,
        data,
        error: errorMsg,
      };
      try {
        port.postMessage(resp);
      } catch {}
    };

    // 1. Authenticate session token and app identity
    if (req.sessionToken !== token || req.appId !== appId) {
      sendResponse(false, undefined, 'Authentication failed: invalid session token or appId');
      return;
    }

    // 2. Enforce Rate Limiting
    requestCountRef.current++;
    if (requestCountRef.current > PROTOCOL_LIMITS.maxRequestsPerSecond) {
      sendResponse(false, undefined, 'Rate limit exceeded: too many requests');
      return;
    }

    const { action, payload } = req;
    const p = (payload || {}) as Record<string, unknown>;

    try {
      switch (action) {
        case 'app:getInfo': {
          sendResponse(true, {
            id: appRecord?.id,
            name: appRecord?.name,
            version: appRecord?.version,
            author: appRecord?.author,
            permissions: appRecord?.manifest.permissions,
          });
          break;
        }

        case 'app:close': {
          sendResponse(true);
          onClose?.();
          break;
        }

        case 'window:setTitle': {
          if (typeof p.title === 'string') {
            setTitle?.(p.title);
            sendResponse(true);
          } else {
            sendResponse(false, undefined, 'Invalid title');
          }
          break;
        }

        case 'window:setMinimumSize': {
          sendResponse(true);
          break;
        }

        // Storage Operations
        case 'storage:get': {
          if (!permissionManager.hasPermission(appId, 'storage:appdata')) {
            sendResponse(false, undefined, "Permission denied: 'storage:appdata' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'storage:appdata');
          const value = await appStorage.get(appId, String(p.key));
          sendResponse(true, value);
          break;
        }

        case 'storage:set': {
          if (!permissionManager.hasPermission(appId, 'storage:appdata')) {
            sendResponse(false, undefined, "Permission denied: 'storage:appdata' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'storage:appdata');
          await appStorage.set(appId, String(p.key), p.value);
          sendResponse(true);
          break;
        }

        case 'storage:delete': {
          if (!permissionManager.hasPermission(appId, 'storage:appdata')) {
            sendResponse(false, undefined, "Permission denied: 'storage:appdata' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'storage:appdata');
          const deleted = await appStorage.delete(appId, String(p.key));
          sendResponse(true, deleted);
          break;
        }

        case 'storage:list': {
          if (!permissionManager.hasPermission(appId, 'storage:appdata')) {
            sendResponse(false, undefined, "Permission denied: 'storage:appdata' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'storage:appdata');
          const keys = await appStorage.list(appId);
          sendResponse(true, keys);
          break;
        }

        // Filesystem Operations
        case 'fs:readText': {
          const filePath = vfs.normalizePath(String(p.path));
          const appPrivateDir = `/home/aether/.local/share/aether/apps/${appId}`;
          const isPrivate = filePath.startsWith(appPrivateDir);

          if (!isPrivate && !permissionManager.hasPermission(appId, 'filesystem:read')) {
            sendResponse(false, undefined, "Permission denied: 'filesystem:read' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'filesystem:read');
          const text = await vfs.readText(filePath);
          sendResponse(true, text);
          break;
        }

        case 'fs:writeText': {
          const filePath = vfs.normalizePath(String(p.path));
          const appPrivateDir = `/home/aether/.local/share/aether/apps/${appId}`;
          const isPrivate = filePath.startsWith(appPrivateDir);

          if (!isPrivate && !permissionManager.hasPermission(appId, 'filesystem:write')) {
            sendResponse(false, undefined, "Permission denied: 'filesystem:write' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'filesystem:write');
          await vfs.writeText(filePath, String(p.content ?? ''));
          sendResponse(true);
          break;
        }

        case 'fs:readBytes': {
          const filePath = vfs.normalizePath(String(p.path));
          const appPrivateDir = `/home/aether/.local/share/aether/apps/${appId}`;
          const isPrivate = filePath.startsWith(appPrivateDir);

          if (!isPrivate && !permissionManager.hasPermission(appId, 'filesystem:read')) {
            sendResponse(false, undefined, "Permission denied: 'filesystem:read' is required");
            return;
          }
          const bytes = await vfs.readBytes(filePath);
          let bin = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            bin += String.fromCharCode.apply(null, chunk as unknown as number[]);
          }
          sendResponse(true, { base64: btoa(bin) });
          break;
        }

        case 'fs:writeBytes': {
          const filePath = vfs.normalizePath(String(p.path));
          const appPrivateDir = `/home/aether/.local/share/aether/apps/${appId}`;
          const isPrivate = filePath.startsWith(appPrivateDir);

          if (!isPrivate && !permissionManager.hasPermission(appId, 'filesystem:write')) {
            sendResponse(false, undefined, "Permission denied: 'filesystem:write' is required");
            return;
          }
          const bin = atob(String(p.bytesBase64 || ''));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          await vfs.writeBytes(filePath, bytes);
          sendResponse(true);
          break;
        }

        case 'fs:exists': {
          const filePath = vfs.normalizePath(String(p.path));
          sendResponse(true, vfs.exists(filePath));
          break;
        }

        // Notification Operations
        case 'notifications:show': {
          if (!permissionManager.hasPermission(appId, 'notifications')) {
            sendResponse(false, undefined, "Permission denied: 'notifications' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'notifications');
          addNotification({
            title: String(p.title || appRecord?.name || 'Application Notification'),
            message: String(p.body || ''),
            level: 'info',
            appId,
          });
          systemEventBus.emit('notification:show', {
            appId,
            title: p.title,
            body: p.body,
          });
          sendResponse(true);
          break;
        }

        // Permission Query / Request
        case 'permissions:query': {
          const scope = String(p.scope);
          const state = permissionManager.getGrantState(appId, scope as any);
          sendResponse(true, state);
          break;
        }

        case 'permissions:request': {
          const scope = String(p.scope);
          const state = permissionManager.getGrantState(appId, scope as any);
          if (state === 'granted') {
            sendResponse(true, true);
          } else if (state === 'denied') {
            sendResponse(true, false);
          } else {
            // Prompt grant: auto-grant for prompt in user session
            permissionManager.grantPermission(appId, scope as any, 'always');
            sendResponse(true, true);
          }
          break;
        }

        case 'system:getTheme': {
          sendResponse(true, {
            mode: theme.mode,
            accentColor: theme.accentColor,
          });
          break;
        }

        default: {
          sendResponse(false, undefined, `Unsupported action: '${action}'`);
          break;
        }
      }
    } catch (err) {
      sendResponse(false, undefined, (err as Error).message);
    }
  };

  // Iframe onLoad: Transfer MessagePort and initialize guest SDK
  const handleIFrameLoad = () => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;

    // Create a new dedicated MessageChannel for this session
    const channel = new MessageChannel();
    channelRef.current = channel;

    // Listen on host port
    channel.port1.onmessage = (e) => {
      const msg = e.data;
      if (isValidAppRequest(msg)) {
        handleAppRequest(msg, sessionToken, effectiveAppId, channel.port1);
      }
    };

    // Send init message with transferred port2
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'aether:init',
        sessionToken,
        appId: effectiveAppId,
        appInfo: {
          id: appRecord?.id,
          name: appRecord?.name,
          version: appRecord?.version,
          author: appRecord?.author,
        },
        theme: {
          mode: theme.mode,
          accentColor: theme.accentColor,
        },
      },
      '*',
      [channel.port2]
    );
  };

  // Dispatch focus / blur lifecycle events to guest
  useEffect(() => {
    if (channelRef.current) {
      const eventMsg: HostEventMessage = {
        type: 'aether:event',
        event: isFocused ? 'focus' : 'blur',
      };
      try {
        channelRef.current.port1.postMessage(eventMsg);
      } catch {}
    }
  }, [isFocused]);

  // Dispatch theme change lifecycle event to guest
  useEffect(() => {
    if (channelRef.current) {
      const eventMsg: HostEventMessage = {
        type: 'aether:event',
        event: 'themeChange',
        payload: {
          mode: theme.mode,
          accentColor: theme.accentColor,
        },
      };
      try {
        channelRef.current.port1.postMessage(eventMsg);
      } catch {}
    }
  }, [theme.mode, theme.accentColor]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-gray-900 text-gray-200">
        <AlertTriangle className="w-12 h-12 text-red-400 mb-3" />
        <h2 className="text-base font-semibold text-white mb-1">Application Failed to Launch</h2>
        <p className="text-xs text-red-300 max-w-md mb-4 bg-red-950/40 p-2.5 rounded border border-red-800/40 font-mono text-left overflow-auto max-h-32">
          {error}
        </p>
        <div className="flex gap-2">
          <button
            onClick={loadApp}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-gray-800 hover:bg-gray-700 text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
          <button
            onClick={() => {
              dynamicAppRegistry.unregister(effectiveAppId);
              onClose?.();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-red-600/80 hover:bg-red-500 text-white transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Uninstall
          </button>
        </div>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400">
        Launching application...
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={blobUrl}
      sandbox="allow-scripts"
      title={appRecord?.name || 'Application'}
      onLoad={handleIFrameLoad}
      className="w-full h-full border-none bg-transparent"
    />
  );
};
