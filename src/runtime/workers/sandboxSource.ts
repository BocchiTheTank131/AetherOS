// AetherOS - Guest Sandbox Worker Script Source

export const SANDBOX_WORKER_CODE = `
(function() {
  'use strict';

  // Secure internal host bridge (private to worker closure)
  const postToHost = typeof self !== 'undefined' && typeof self.postMessage === 'function'
    ? self.postMessage.bind(self)
    : function() {};

  // Pending host requests map
  const pendingRequests = new Map();
  let reqSeq = 0;

  // Intercept console with bounded string formatting
  const guestConsole = Object.freeze({
    log: function(...args) {
      postToHost({
        type: 'stdout',
        text: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n'
      });
    },
    info: function(...args) {
      postToHost({
        type: 'stdout',
        text: '[INFO] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n'
      });
    },
    warn: function(...args) {
      postToHost({
        type: 'stderr',
        text: '[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n'
      });
    },
    error: function(...args) {
      postToHost({
        type: 'stderr',
        text: '[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n'
      });
    }
  });

  // Secure guest AetherOS bridge API
  const guestAether = Object.freeze({
    fs: Object.freeze({
      readText: function(path) {
        return sendFsRequest('readText', { path });
      },
      writeText: function(path, content) {
        return sendFsRequest('writeText', { path, content });
      },
      readBytes: function(path) {
        return sendFsRequest('readBytes', { path }).then(res => {
          if (!res || !res.base64) return new Uint8Array(0);
          const bin = atob(res.base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes;
        });
      },
      writeBytes: function(path, bytes) {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return sendFsRequest('writeBytes', { path, bytesBase64: btoa(bin) });
      },
      exists: function(path) {
        return sendFsRequest('exists', { path });
      },
      stat: function(path) {
        return sendFsRequest('stat', { path });
      }
    })
  });

  function sendFsRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = 'req_' + (++reqSeq);
      pendingRequests.set(id, { resolve, reject });
      postToHost({
        type: 'fs_request',
        id,
        method,
        ...params
      });
    });
  }

  // Lock down sensitive ambient worker APIs
  try { self.importScripts = undefined; } catch {}
  try { self.fetch = undefined; } catch {}
  try { self.XMLHttpRequest = undefined; } catch {}
  try { self.WebSocket = undefined; } catch {}
  try { self.indexedDB = undefined; } catch {}
  try { self.Worker = undefined; } catch {}
  try { self.SharedWorker = undefined; } catch {}
  try { self.BroadcastChannel = undefined; } catch {}
  try { self.Notification = undefined; } catch {}
  try { self.close = undefined; } catch {}

  globalThis.console = guestConsole;
  globalThis.aether = guestAether;

  // Message dispatcher
  self.onmessage = async function(e) {
    const msg = e.data;
    if (!msg) return;

    if (msg.type === 'fs_response') {
      const p = pendingRequests.get(msg.id);
      if (p) {
        pendingRequests.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(msg.error));
        } else {
          p.resolve(msg.result);
        }
      }
      return;
    }

    if (msg.type === 'execute') {
      try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        // Wrapped with strict mode and sandboxed arguments
        const fn = new AsyncFunction('aether', 'args', 'console', '"use strict";\\n' + msg.code);
        const result = await fn(guestAether, msg.args || [], guestConsole);
        postToHost({ type: 'exit', exitCode: 0, result });
      } catch (err) {
        postToHost({
          type: 'stderr',
          text: (err && err.stack ? err.stack : (err && err.message ? err.message : String(err))) + '\\n'
        });
        postToHost({ type: 'exit', exitCode: 1 });
      }
    }
  };
})();
`;
