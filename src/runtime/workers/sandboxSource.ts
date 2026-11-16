// AetherOS - Guest Sandbox Worker Script Source

export const SANDBOX_WORKER_CODE = `
(function() {
  'use strict';

  // Secure internal host bridge (private to worker closure)
  const postToHost = typeof self !== 'undefined' && typeof self.postMessage === 'function'
    ? self.postMessage.bind(self)
    : function() {};

  const listen = self.addEventListener.bind(self);
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const stringify = JSON.stringify;
  const parse = JSON.parse;
  const slice = Function.call.bind(String.prototype.slice);
  const toString = String;
  const limit = 2 * 1024 * 1024;
  let remaining = limit;
  function log(type, prefix, args) {
    if (remaining <= 0) return;
    let text = prefix;
    for (const arg of args) {
      if (text.length >= remaining) break;
      let formatted;
      try { formatted = typeof arg === 'object' ? stringify(arg) : toString(arg); }
      catch { formatted = '[unserializable]'; }
      text += slice(formatted || '', 0, remaining - text.length) + ' ';
    }
    text = slice(text, 0, -1) + '\\n';
    remaining -= text.length + 64;
    postToHost({ type, text });
  }

  // Pending host requests map
  const pendingRequests = new Map();
  let reqSeq = 0;

  const guestConsole = Object.freeze({
    log: (...args) => log('stdout', '', args),
    info: (...args) => log('stdout', '[INFO] ', args),
    warn: (...args) => log('stderr', '[WARN] ', args),
    error: (...args) => log('stderr', '[ERROR] ', args),
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
        if (!(bytes instanceof Uint8Array) || bytes.length > limit) throw new Error('Invalid or oversized file');
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
      if (typeof params.path !== 'string' || params.path.length > 1024 ||
          (params.content !== undefined && (typeof params.content !== 'string' || params.content.length > limit))) {
        return reject(new Error('Invalid or oversized filesystem request'));
      }
      if (pendingRequests.size >= 64 || reqSeq >= 4096) return reject(new Error('Filesystem request limit exceeded'));
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

  // Lock down sensitive ambient worker APIs across prototypes and global scope
  const scopes = [
    typeof WorkerGlobalScope !== 'undefined' ? WorkerGlobalScope.prototype : null,
    typeof DedicatedWorkerGlobalScope !== 'undefined' ? DedicatedWorkerGlobalScope.prototype : null,
    EventTarget.prototype,
    self
  ];
  const blocked = [
    'importScripts',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'indexedDB',
    'Worker',
    'SharedWorker',
    'BroadcastChannel',
    'Notification',
    'close', 'postMessage', 'onmessage', 'onmessageerror', 'addEventListener',
    'removeEventListener', 'dispatchEvent', 'MessageChannel', 'MessagePort',
    'caches', 'navigator', 'location', 'WebTransport', 'RTCPeerConnection',
    'EventSource', 'FileReader', 'FileReaderSync'
  ];
  for (const scope of scopes) {
    if (!scope) continue;
    for (const prop of blocked) {
      try {
        Object.defineProperty(scope, prop, {
          value: undefined,
          writable: false,
          configurable: false,
        });
      } catch {
        if (scope[prop] !== undefined) throw new Error('Could not lock down ' + prop);
      }
    }
  }

  globalThis.console = guestConsole;
  globalThis.aether = guestAether;

  // Message dispatcher
  let started = false;
  listen('message', async function(e) {
    const msg = e.data;
    if (!e.isTrusted || !msg) return;

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

    if (msg.type === 'execute' && !started) {
      started = true;
      try {
        // Wrapped with strict mode and sandboxed arguments
        const fn = new AsyncFunction('aether', 'args', 'console', '"use strict";\\n' + msg.code);
        const result = await fn(guestAether, msg.args || [], guestConsole);
        const serialized = stringify(result);
        if (serialized && serialized.length > limit) throw new Error('Execution result exceeds output limit');
        postToHost({ type: 'exit', exitCode: 0, result: serialized === undefined ? undefined : parse(serialized) });
      } catch (err) {
        postToHost({
          type: 'stderr',
          text: slice(toString(err && (err.stack || err.message) || err), 0, 65536) + '\\n'
        });
        postToHost({ type: 'exit', exitCode: 1 });
      }
    }
  });
})();
`;
