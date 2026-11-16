// AetherOS - Hardened Pyodide WebWorker Sandbox Source (Pyodide v0.27.2)

export const PYODIDE_VERSION = '0.27.2';
const PYODIDE_BASE = 'https://python.aether.invalid/';

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

  const importTrustedScript = self.importScripts.bind(self);
  function installRuntimeAssets(assets) {
    if (!assets) return;
    const base = '${PYODIDE_BASE}';
    const get = (url) => {
      const href = new URL(typeof url === 'string' ? url : url.url || url.href, base).href;
      const key = href.startsWith(base) && href.slice(base.length);
      if (!key || !Object.prototype.hasOwnProperty.call(assets, key)) throw new Error('Asset is outside the Python runtime');
      return assets[key];
    };
    self.fetch = async (url) => {
      const type = String(url).endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
      return new Response(get(url), { headers: { 'Content-Type': type } });
    };
    self.importScripts = (...urls) => {
      for (const url of urls) {
        const script = URL.createObjectURL(new Blob([get(url)], { type: 'text/javascript' }));
        try { importTrustedScript(script); } finally { URL.revokeObjectURL(script); }
      }
    };
  }

  let remainingOutput = 2 * 1024 * 1024;
  function output(type, text) {
    if (remainingOutput <= 0) return;
    text = text.slice(0, remainingOutput);
    remainingOutput -= text.length + 64;
    post({ type, text: text + '\\n' });
  }

  let pyodideInstance = null;
  let isInitializing = false;

  async function getPyodide(assets) {
    if (pyodideInstance) return pyodideInstance;
    if (isInitializing) {
      while (isInitializing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return pyodideInstance;
    }

    isInitializing = true;
    try {
      installRuntimeAssets(assets);
      importScripts('${PYODIDE_BASE}pyodide.js');
      post({ type: 'status', message: 'Initializing Python WebAssembly environment...' });

      pyodideInstance = await self.loadPyodide({
        indexURL: '${PYODIDE_BASE}',
        stdout: (text) => output('stdout', text),
        stderr: (text) => output('stderr', text),
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
        await getPyodide(data.assets);
      } catch {}
      return;
    }

    if (data.type === 'execute' && !started) {
      started = true;
      try {
        const py = await getPyodide(data.assets);
        if (data.packages && data.packages.length) {
          post({ type: 'status', message: 'Loading verified Pyodide packages...' });
          await py.loadPackage(data.packages);
        }
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
        await py.runPythonAsync(code, { filename });

        // Scan /workspace for modified or created files to sync back to host
        const syncedFiles = Object.create(null);
        let remaining = 20 * 1024 * 1024;
        let count = 0;
        function scanDir(dir, prefix, depth = 0) {
          if (depth > 32) throw new Error('Python output directory nesting limit exceeded');
          for (const entry of py.FS.readdir(dir)) {
            if (entry.startsWith('.') || entry === 'dist' || entry === '__pycache__' || entry === 'node_modules') continue;
            if (++count > 1000) throw new Error('Python output file count limit exceeded');
            const fullPath = dir + '/' + entry;
            const relPath = prefix ? prefix + '/' + entry : entry;
            const stat = py.FS.lstat(fullPath);
            if (py.FS.isLink(stat.mode)) throw new Error('Symbolic links cannot be synced from Python: ' + relPath);
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
