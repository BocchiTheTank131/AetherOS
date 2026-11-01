// AetherOS - Hardened Pyodide WebWorker Sandbox Source (Pyodide v0.27.2)

export const PYODIDE_VERSION = '0.27.2';
export const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export const PYTHON_WORKER_CODE = `
(function() {
  'use strict';

  // Strip ambient host capabilities before code evaluation
  const forbiddenGlobals = [
    'Worker', 'SharedWorker', 'WebSocket', 'Notification',
    'BroadcastChannel', 'indexedDB'
  ];
  for (const name of forbiddenGlobals) {
    try {
      Object.defineProperty(self, name, {
        value: undefined,
        writable: false,
        configurable: false,
      });
    } catch {}
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
      self.postMessage({ type: 'status', message: 'Downloading Pyodide WebAssembly runtime (v${PYODIDE_VERSION})...' });
      importScripts('${PYODIDE_CDN_BASE}pyodide.js');
      self.postMessage({ type: 'status', message: 'Initializing Python WebAssembly environment...' });

      pyodideInstance = await self.loadPyodide({
        indexURL: '${PYODIDE_CDN_BASE}',
        stdout: (text) => self.postMessage({ type: 'stdout', text: text + '\\n' }),
        stderr: (text) => self.postMessage({ type: 'stderr', text: text + '\\n' }),
      });

      // Initialize workspace directory in MEMFS
      try {
        pyodideInstance.FS.mkdir('/workspace');
      } catch {}

      self.postMessage({ type: 'status', message: 'Python runtime ready.' });
      isInitializing = false;
      return pyodideInstance;
    } catch (err) {
      isInitializing = false;
      self.postMessage({ type: 'stderr', text: 'Failed to load Pyodide WebAssembly runtime: ' + String(err) + '\\n' });
      throw err;
    }
  }

  self.onmessage = async function(e) {
    const data = e.data;
    if (!data) return;

    if (data.type === 'init') {
      try {
        await getPyodide();
      } catch {}
      return;
    }

    if (data.type === 'execute') {
      try {
        const py = await getPyodide();
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
        py.runPython(\`
import sys, os
from pathlib import Path
sys.argv = [\${JSON.stringify([filename, ...args]).slice(1, -1)}]
\`);

        // Execute code
        await py.runPythonAsync(code);

        // Scan /workspace for modified or created files to sync back to host
        const syncedFiles = {};
        function scanDir(dir, prefix) {
          try {
            const entries = py.FS.readdir(dir);
            for (const entry of entries) {
              if (entry === '.' || entry === '..') continue;
              const fullPath = dir + '/' + entry;
              const relPath = prefix ? prefix + '/' + entry : entry;
              const stat = py.FS.stat(fullPath);
              if (py.FS.isDir(stat.mode)) {
                scanDir(fullPath, relPath);
              } else {
                syncedFiles[relPath] = py.FS.readFile(fullPath);
              }
            }
          } catch {}
        }
        scanDir('/workspace', '');

        self.postMessage({ type: 'sync_files', files: syncedFiles });
        self.postMessage({ type: 'exit', exitCode: 0 });
      } catch (err) {
        const msg = String(err);
        self.postMessage({ type: 'stderr', text: msg + '\\n' });
        self.postMessage({ type: 'exit', exitCode: 1 });
      }
    }
  };
})();
`;
