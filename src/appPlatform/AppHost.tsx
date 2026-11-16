// AetherOS - Sandboxed Application Host Component
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AppProps } from '../apps/types';
import { dynamicAppRegistry, type InstalledAppRecord } from './DynamicAppRegistry';
import { permissionManager } from './PermissionManager';
import { appStorage, resolveAppFilesystemPath } from './AppStorage';
import { isAppId } from './AppManifest';
import { VALID_PERMISSION_SCOPES, PERMISSION_METADATA, type PermissionScope } from './AppPermissions';
import { dialogService } from '../core/dialog';
import { hasControlCharacters, isWithin, relativeFilePath, withoutSymlinks } from '../vfs/safePath';
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
  const tokenRef = useRef('');
  const permissionPrompt = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const channelRef = useRef<{ port1: MessagePort } | null>(null);
  const currentUrl = useRef<string | null>(null);
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
    dynamicAppRegistry.get(effectiveAppId);

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

      if (!isAppId(effectiveAppId) || effectiveAppId !== appRecord.id) {
        throw new Error('Invalid application identity');
      }
      const installDir = withoutSymlinks(appRecord.installDir);
      if (!previewRecord && !isWithin(installDir, `/opt/aether/apps/${effectiveAppId}`)) {
        throw new Error('Application is outside its install directory');
      }
      const entryFile = withoutSymlinks(`${installDir}/${relativeFilePath(appRecord.entry)}`);
      const entryDir = entryFile.slice(0, entryFile.lastIndexOf('/'));
      let remainingBytes = 24 * 1024 * 1024;
      const checkAsset = (path: string) => {
        const stat = vfs.stat(path);
        if (!stat.isFile() || stat.size > remainingBytes) throw new Error('Application exceeds the launch size limit');
        remainingBytes -= stat.size;
        return path;
      };
      const readAsset = (src: string) => {
        if (/^(?:[\w+.-]+:|\/\/)/.test(src)) return undefined;
        const relative = decodeURIComponent(src.split(/[?#]/, 1)[0]);
        const base = relative.startsWith('/') ? installDir : entryDir;
        const path = withoutSymlinks(`${base}/${relative.replace(/^\/+/, '')}`);
        if (!isWithin(path, installDir) || relative.includes('\\') || hasControlCharacters(relative)) {
          throw new Error(`Asset is outside the package: ${src}`);
        }
        return vfs.exists(path) ? checkAsset(path) : undefined;
      };

      let html = vfs.readFile(checkAsset(entryFile));
      html = html.replace(/(<(?:img|audio|video|source)\s[^>]*?\bsrc=)(["'])([^"']+)\2/gi, (tag, start, quote, src) => {
        const path = readAsset(src);
        if (!path) return tag;
        const mime = vfs.stat(path).mimeType ?? '';
        if (!/^(?:image|audio|video)\/[a-z0-9.+-]+$/i.test(mime)) return tag;
        const bytes = vfs.readBytes(path);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return start + quote + 'data:' + mime + ';base64,' + btoa(binary) + quote;
      });
      html = html.replace(/<script\s+([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (match, before, src, after) => {
        const path = readAsset(src);
        if (!path) return match;
        const script = vfs.readFile(path).replace(/<\/script/gi, '<\\/script');
        return `<script ${before}${after}>\n${script}\n</script>`;
      });
      html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
        const path = readAsset(href);
        return path ? `<style>\n${vfs.readFile(path).replace(/<\/style/gi, '<\\/style')}\n</style>` : match;
      });

      const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline' blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; base-uri 'none'; form-action 'none';">`;
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, '0')).join('');
      const sdk = `<script>(${SDK_CLIENT_SCRIPT})(${JSON.stringify(token)})</script>`;
      html = `<!DOCTYPE html>${csp}${sdk}${html.replace(/^\s*<!doctype[^>]*>/i, '')}`;
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      channelRef.current?.port1.close();
      channelRef.current = null;
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = url;
      tokenRef.current = token;
      setBlobUrl(url);

      if (appRecord.name) {
        setTitleRef.current?.(appRecord.name);
      }
    } catch (err) {
      const msg = (err as Error).message || String(err);
      setError(msg);
      systemLogger.error('appHost', `Failed to load app '${effectiveAppId}': ${msg}`);
    }
  }, [appRecord, effectiveAppId, previewRecord]);

  useEffect(() => {
    const timer = setTimeout(loadApp, 0);
    return () => {
      clearTimeout(timer);
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = null;
      channelRef.current?.port1.close();
      channelRef.current = null;
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
    if (previewRecord && /^(fs:|storage:|notifications:)/.test(action)) {
      sendResponse(false, undefined, 'Install the application to grant this capability');
      return;
    }
    if (!previewRecord && dynamicAppRegistry.get(appId) !== appRecord) return;
    const p = (payload || {}) as Record<string, unknown>;

    try {
      if (typeof p.title === 'string' && p.title.length > 256) throw new Error('Title is too long');
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
          if (typeof p.key !== 'string' || !p.key || p.key.length > 1024) throw new Error('Invalid storage key');
          if (!appRecord?.manifest.permissions?.includes('storage:appdata') || !permissionManager.hasPermission(appId, 'storage:appdata')) {
            sendResponse(false, undefined, "Permission denied: 'storage:appdata' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'storage:appdata');
          const value = await appStorage.get(appId, p.key);
          sendResponse(true, value);
          break;
        }

        case 'storage:set': {
          if (typeof p.key !== 'string' || !p.key || p.key.length > 1024) throw new Error('Invalid storage key');
          if (!appRecord?.manifest.permissions?.includes('storage:appdata') || !permissionManager.hasPermission(appId, 'storage:appdata')) {
            sendResponse(false, undefined, "Permission denied: 'storage:appdata' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'storage:appdata');
          const value = JSON.stringify(p.value);
          if (value === undefined || value.length > PROTOCOL_LIMITS.maxPayloadBytes) throw new Error('Invalid storage value');
          await appStorage.set(appId, p.key, p.value);
          sendResponse(true);
          break;
        }

        case 'storage:delete': {
          if (typeof p.key !== 'string' || !p.key || p.key.length > 1024) throw new Error('Invalid storage key');
          if (!appRecord?.manifest.permissions?.includes('storage:appdata') || !permissionManager.hasPermission(appId, 'storage:appdata')) {
            sendResponse(false, undefined, "Permission denied: 'storage:appdata' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'storage:appdata');
          const deleted = await appStorage.delete(appId, p.key);
          sendResponse(true, deleted);
          break;
        }

        case 'storage:list': {
          if (!appRecord?.manifest.permissions?.includes('storage:appdata') || !permissionManager.hasPermission(appId, 'storage:appdata')) {
            sendResponse(false, undefined, "Permission denied: 'storage:appdata' is required");
            return;
          }
          permissionManager.recordUsage(appId, 'storage:appdata');
          const keys = await appStorage.list(appId);
          sendResponse(true, keys);
          break;
        }

        // Filesystem Operations
        case 'fs:readText':
        case 'fs:readBytes':
        case 'fs:writeText':
        case 'fs:writeBytes':
        case 'fs:exists': {
          const { path, isPrivate } = resolveAppFilesystemPath(appId, p.path);
          const write = action.startsWith('fs:write');
          const scope = isPrivate ? 'storage:appdata' : write ? 'filesystem:write' : 'filesystem:read';
          if (!appRecord?.manifest.permissions?.includes(scope) || !permissionManager.hasPermission(appId, scope)) throw new Error(`Permission denied: '${scope}' is required`);
          if (!vfs.checkAccess(path, write ? 'w' : 'r')) throw new Error('Permission denied by AetherFS');
          permissionManager.recordUsage(appId, scope);
          if (action === 'fs:exists') {
            sendResponse(true, vfs.exists(path));
          } else if (write) {
            const content = action === 'fs:writeText' ? p.content : p.bytesBase64;
            if (typeof content !== 'string' || content.length > PROTOCOL_LIMITS.maxPayloadBytes) {
              throw new Error('Invalid or oversized file payload');
            }
            const bytes = action === 'fs:writeText'
              ? new TextEncoder().encode(content)
              : Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
            if (bytes.length > PROTOCOL_LIMITS.maxPayloadBytes) throw new Error('File payload exceeds byte limit');
            if (isPrivate) appStorage.checkFileQuota(appId, path, bytes.length);
            if (action === 'fs:writeText') vfs.writeText(path, content);
            else vfs.writeBytesSync(path, bytes);
            sendResponse(true);
          } else {
            if (vfs.stat(path).size > PROTOCOL_LIMITS.maxPayloadBytes) throw new Error('File exceeds read limit');
            if (action === 'fs:readText') {
              sendResponse(true, vfs.readText(path));
            } else {
              const bytes = vfs.readBytes(path);
              let binary = '';
              for (let i = 0; i < bytes.length; i += 8192) {
                binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
              }
              sendResponse(true, { base64: btoa(binary) });
            }
          }
          break;
        }

        // Notification Operations
        case 'notifications:show': {
          if (!appRecord?.manifest.permissions?.includes('notifications') || !permissionManager.hasPermission(appId, 'notifications')) {
            sendResponse(false, undefined, "Permission denied: 'notifications' is required");
            return;
          }
          if ((p.title !== undefined && typeof p.title !== 'string') ||
              (p.body !== undefined && (typeof p.body !== 'string' || p.body.length > 4096))) {
            throw new Error('Invalid notification');
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
        case 'permissions:query':
        case 'permissions:request': {
          const scope = p.scope as PermissionScope;
          if (!VALID_PERMISSION_SCOPES.includes(scope)) throw new Error('Unknown permission scope');
          const declared = appRecord?.manifest.permissions?.includes(scope);
          const state = declared ? permissionManager.getGrantState(appId, scope) : 'denied';
          if (action === 'permissions:query') {
            sendResponse(true, state);
          } else if (state !== 'prompt' || previewRecord) {
            sendResponse(true, state === 'granted' && !previewRecord);
          } else {
            if (permissionPrompt.current) throw new Error('A permission prompt is already open');
            permissionPrompt.current = true;
            try {
              const granted = await dialogService.confirm({
                title: `Allow ${appRecord?.name} to use ${scope}?`,
                message: PERMISSION_METADATA[scope].description,
                confirmText: 'Allow for this session',
                cancelText: 'Deny',
              });
              if (channelRef.current?.port1 !== port || !dynamicAppRegistry.isInstalled(appId)) return;
              if (granted && permissionManager.getGrantState(appId, scope) === 'prompt') {
                permissionManager.grantPermission(appId, scope, 'session');
              }
              sendResponse(true, permissionManager.hasPermission(appId, scope));
            } finally {
              permissionPrompt.current = false;
            }
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

  useEffect(() => {
    const connect = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== 'null' ||
          event.data?.type !== 'aether:connect' || event.data?.token !== tokenRef.current ||
          !event.ports[0] || channelRef.current) return;

      const port = event.ports[0];
      const token = tokenRef.current;
      channelRef.current = { port1: port };
      port.onmessage = ({ data }) => {
        if (isValidAppRequest(data)) void handleAppRequest(data, token, effectiveAppId, port);
      };
      port.postMessage({
        type: 'aether:init',
        appId: effectiveAppId,
        appInfo: { id: appRecord?.id, name: appRecord?.name, version: appRecord?.version, author: appRecord?.author },
        theme: { mode: theme.mode, accentColor: theme.accentColor },
      });
    };
    window.addEventListener('message', connect);
    return () => window.removeEventListener('message', connect);
  });

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
      className="w-full h-full border-none bg-transparent"
    />
  );
};
