// AetherOS - Sandboxed Guest SDK Bootstrap Script
// This script is injected directly into guest iframe HTML environments.

export const SDK_CLIENT_SCRIPT = `
(function() {
  if (window.aether) return;

  var port = null;
  var sessionToken = null;
  var appId = null;
  var appInfo = null;
  var pendingRequests = new Map();
  var eventHandlers = new Map();
  var queuedCalls = [];
  var isReady = false;

  function applyThemeVars(theme) {
    if (!theme) return;
    var root = document.documentElement;
    var isDark = theme.mode !== 'light';
    root.style.setProperty('--aether-bg', isDark ? '#0f172a' : '#f8fafc');
    root.style.setProperty('--aether-surface', isDark ? '#1e293b' : '#ffffff');
    root.style.setProperty('--aether-border', isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)');
    root.style.setProperty('--aether-fg', isDark ? '#f1f5f9' : '#0f172a');
    root.style.setProperty('--aether-muted', isDark ? '#94a3b8' : '#64748b');
    root.style.setProperty('--aether-accent', theme.accentColor || '#06b6d4');
    root.style.setProperty('--aether-font', 'system-ui, -apple-system, sans-serif');
  }

  function callHost(action, payload) {
    return new Promise(function(resolve, reject) {
      var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      var execute = function() {
        if (!port) {
          reject(new Error('Aether SDK: Communication port is not available'));
          return;
        }
        pendingRequests.set(reqId, { resolve: resolve, reject: reject });
        port.postMessage({
          id: reqId,
          type: 'req',
          action: action,
          payload: payload,
          sessionToken: sessionToken,
          appId: appId
        });
      };

      if (!isReady) {
        queuedCalls.push(execute);
      } else {
        execute();
      }
    });
  }

  function emitEvent(eventName, data) {
    var list = eventHandlers.get(eventName) || [];
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](data);
      } catch (err) {
        console.error('Error in aether.' + eventName + ' handler:', err);
      }
    }
  }

  window.addEventListener('message', function onInitMessage(e) {
    var data = e.data;
    if (data && data.type === 'aether:init' && e.ports && e.ports[0]) {
      port = e.ports[0];
      sessionToken = data.sessionToken;
      appId = data.appId;
      appInfo = data.appInfo;
      applyThemeVars(data.theme);

      port.onmessage = function(pe) {
        var msg = pe.data;
        if (!msg) return;

        if (msg.type === 'res') {
          var pending = pendingRequests.get(msg.id);
          if (pending) {
            pendingRequests.delete(msg.id);
            if (msg.success) {
              pending.resolve(msg.data);
            } else {
              pending.reject(new Error(msg.error || 'Request failed'));
            }
          }
        } else if (msg.type === 'aether:event') {
          if (msg.event === 'themeChange') {
            applyThemeVars(msg.payload);
          }
          emitEvent(msg.event, msg.payload);
        }
      };

      isReady = true;
      while (queuedCalls.length > 0) {
        var fn = queuedCalls.shift();
        try { fn(); } catch(err) { console.error(err); }
      }

      emitEvent('ready', { appId: appId });
      window.removeEventListener('message', onInitMessage);
    }
  });

  window.aether = {
    app: {
      getInfo: function() {
        return callHost('app:getInfo').then(function(res) {
          return res || appInfo;
        });
      },
      close: function() {
        return callHost('app:close');
      }
    },
    window: {
      setTitle: function(title) {
        return callHost('window:setTitle', { title: title });
      },
      setMinimumSize: function(width, height) {
        return callHost('window:setMinimumSize', { width: width, height: height });
      }
    },
    fs: {
      readText: function(path) {
        return callHost('fs:readText', { path: path });
      },
      writeText: function(path, content) {
        return callHost('fs:writeText', { path: path, content: content });
      },
      readBytes: function(path) {
        return callHost('fs:readBytes', { path: path }).then(function(res) {
          var binary = atob(res.base64);
          var len = binary.length;
          var bytes = new Uint8Array(len);
          for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        });
      },
      writeBytes: function(path, bytes) {
        var binary = '';
        var len = bytes.byteLength;
        for (var i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
        return callHost('fs:writeBytes', { path: path, bytesBase64: btoa(binary) });
      },
      exists: function(path) {
        return callHost('fs:exists', { path: path });
      }
    },
    storage: {
      get: function(key) {
        return callHost('storage:get', { key: key });
      },
      set: function(key, value) {
        return callHost('storage:set', { key: key, value: value });
      },
      delete: function(key) {
        return callHost('storage:delete', { key: key });
      },
      list: function() {
        return callHost('storage:list');
      }
    },
    notifications: {
      show: function(options) {
        return callHost('notifications:show', options);
      }
    },
    clipboard: {
      readText: function() {
        return callHost('clipboard:read');
      },
      writeText: function(text) {
        return callHost('clipboard:write', { text: text });
      }
    },
    permissions: {
      query: function(scope) {
        return callHost('permissions:query', { scope: scope });
      },
      request: function(scope) {
        return callHost('permissions:request', { scope: scope });
      }
    },
    system: {
      getTheme: function() {
        return callHost('system:getTheme');
      }
    },
    on: function(event, handler) {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event).push(handler);
    },
    off: function(event, handler) {
      var list = eventHandlers.get(event);
      if (!list) return;
      var idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    }
  };
})();
`;
