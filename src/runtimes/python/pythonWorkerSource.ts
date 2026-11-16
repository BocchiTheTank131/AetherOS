// AetherOS - Hardened Pyodide WebWorker Sandbox Source (Pyodide v0.27.2)

export const PYODIDE_VERSION = '0.27.2';
export const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export const PYTHON_WORKER_CODE = `
(function() {
  'use strict';

  const post = self.postMessage.bind(self);
  const listen = self.addEventListener.bind(self);
  function lockBrowserCapabilities() {
    const denied = [
      'Worker', 'SharedWorker', 'WebSocket', 'WebTransport', 'Notification',
      'BroadcastChannel', 'indexedDB', 'caches', 'navigator', 'location',
      'fetch', 'importScripts', 'XMLHttpRequest', 'EventSource', 'close',
      'postMessage', 'addEventListener', 'removeEventListener', 'dispatchEvent',
      'onmessage', 'onmessageerror', 'loadPyodide', 'MessageChannel', 'MessagePort'
    ];
    let scope = self;
    while (scope && scope !== Object.prototype) {
      for (const name of denied) {
        if (scope === self || Object.prototype.hasOwnProperty.call(scope, name)) {
          try { Object.defineProperty(scope, name, { value: undefined, configurable: false, writable: false }); }
          catch { if (scope[name] !== undefined) throw new Error('Could not lock down ' + name); }
        }
      }
      scope = Object.getPrototypeOf(scope);
    }
  }

  let pyodideInstance = null;
  let isInitializing = false;

  async function getPyodide() {
    if (pyodideInstance) return pyodideInstance;
    if (isInitializing) {
      while (isInitializing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return pyodideInstance;
    }

    isInitializing = true;
    try {
      post({ type: 'status', message: 'Downloading Pyodide WebAssembly runtime (v${PYODIDE_VERSION})...' });
      importScripts('${PYODIDE_CDN_BASE}pyodide.js');
      post({ type: 'status', message: 'Initializing Python WebAssembly environment...' });

      pyodideInstance = await self.loadPyodide({
        indexURL: '${PYODIDE_CDN_BASE}',
        stdout: (text) => post({ type: 'stdout', text: text + '\\n' }),
        stderr: (text) => post({ type: 'stderr', text: text + '\\n' }),
      });

      // Initialize workspace directory in MEMFS
      try {
        pyodideInstance.FS.mkdir('/workspace');
      } catch {}

      post({ type: 'status', message: 'Python runtime ready.' });
      isInitializing = false;
      return pyodideInstance;
    } catch (err) {
      isInitializing = false;
      post({ type: 'stderr', text: 'Failed to load Pyodide WebAssembly runtime: ' + String(err) + '\\n' });
      throw err;
    }
  }

  let started = false;
  listen('message', async function(e) {
    const data = e.data;
    if (!e.isTrusted || !data) return;

    if (data.type === 'init') {
      try {
        await getPyodide();
      } catch {}
      return;
    }

    if (data.type === 'execute' && !started) {
      started = true;
      try {
        const py = await getPyodide();
        lockBrowserCapabilities();
        const code = data.code || '';
        const args = data.args || [];
        const filename = data.filename || 'script.py';
        const files = data.files || {};

        // Mount input files into Pyodide MEMFS /workspace
        const enc = new TextEncoder();
        for (const [relPath, content] of Object.entries(files)) {
          const parts = relPath.split('/');
          let curr = '/workspace';
          for (let i = 0; i < parts.length - 1; i++) {
            curr += '/' + parts[i];
            try { py.FS.mkdir(curr); } catch {}
          }
          const target = '/workspace/' + relPath;
          const u8 = typeof content === 'string' ? enc.encode(content) : content;
          try {
            py.FS.writeFile(target, u8);
          } catch {}
        }

        // Setup sys.argv and working directory
        py.FS.chdir('/workspace');
        py.globals.set('_aether_argv_json', JSON.stringify([filename, ...args]));
        py.runPython(\`
import json, sys, os
from pathlib import Path
sys.argv = json.loads(_aether_argv_json)
del _aether_argv_json
\`);

        // Execute code
        await py.runPythonAsync(code);

        // Scan /workspace for modified or created files to sync back to host
        const syncedFiles = Object.create(null);
        let remaining = 20 * 1024 * 1024;
        let count = 0;
        function scanDir(dir, prefix, depth = 0) {
          if (depth > 32) throw new Error('Python output directory nesting limit exceeded');
          for (const entry of py.FS.readdir(dir)) {
            if (entry.startsWith('.') || entry === 'dist' || entry === '__pycache__') continue;
            if (++count > 1000) throw new Error('Python output file count limit exceeded');
            const fullPath = dir + '/' + entry;
            const relPath = prefix ? prefix + '/' + entry : entry;
            const stat = py.FS.lstat(fullPath);
            if (py.FS.isDir(stat.mode)) {
              scanDir(fullPath, relPath, depth + 1);
            } else if (py.FS.isFile(stat.mode)) {
              remaining -= stat.size;
              if (remaining < 0) throw new Error('Python output file size limit exceeded');
              syncedFiles[relPath] = py.FS.readFile(fullPath);
            }
          }
        }
        if (py.FS.isDir(py.FS.lstat('/workspace').mode)) scanDir('/workspace', '');

        post({ type: 'sync_files', files: syncedFiles });
        post({ type: 'exit', exitCode: 0 });
      } catch (err) {
        const msg = String(err);
        post({ type: 'stderr', text: msg + '\\n' });
        post({ type: 'exit', exitCode: 1 });
      }
    }
  });
})();
`;
