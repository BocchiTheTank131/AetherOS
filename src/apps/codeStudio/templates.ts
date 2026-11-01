// AetherOS - Code Studio Application Templates
import type { AppManifest } from '../../appPlatform/AppManifest';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  type: 'windowed' | 'cli';
  files: Record<string, string>;
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'hello-aether',
    name: 'Hello Aether (Windowed App)',
    description: 'Interactive windowed application with counter state, persistent storage, and notifications.',
    type: 'windowed',
    files: {
      'manifest.json': JSON.stringify(
        {
          schemaVersion: 1,
          id: 'dev.aether.hello',
          name: 'Hello Aether',
          version: '1.0.0',
          description: 'Interactive demonstration application for AetherOS v1.3',
          author: 'Aether Developer',
          type: 'windowed',
          entry: 'index.html',
          icon: 'Package',
          window: {
            defaultWidth: 640,
            defaultHeight: 440,
            minWidth: 360,
            minHeight: 280,
            resizable: true,
          },
          permissions: ['storage:appdata', 'notifications'],
          dependencies: {},
          fileAssociations: [],
        } as AppManifest,
        null,
        2
      ),
      'index.html': `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Hello Aether</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 id="app-title">Hello Aether</h1>
      <p class="subtitle">AetherOS v1.3 Extensible Application</p>
    </div>

    <div class="card">
      <div class="counter-display">
        <span class="label">Counter Value:</span>
        <span id="counter" class="value">0</span>
      </div>
      <div class="button-group">
        <button id="btn-inc" class="btn btn-primary">Increment (+1)</button>
        <button id="btn-reset" class="btn btn-secondary">Reset</button>
      </div>
    </div>

    <div class="card">
      <h3>System Notifications</h3>
      <p class="desc">Test permission-gated notification alerts.</p>
      <button id="btn-notify" class="btn btn-accent">Send Notification</button>
    </div>

    <div class="footer">
      <span id="status">Ready</span>
    </div>
  </div>
  <script src="main.js"></script>
</body>
</html>`,
      'styles.css': `body {
  margin: 0;
  padding: 16px;
  background-color: var(--aether-bg, #0f172a);
  color: var(--aether-fg, #f8fafc);
  font-family: var(--aether-font, system-ui, -apple-system, sans-serif);
  display: flex;
  justify-content: center;
}
.container {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.header {
  text-align: center;
  border-bottom: 1px solid var(--aether-border, rgba(255,255,255,0.1));
  padding-bottom: 10px;
}
h1 { margin: 0; font-size: 18px; color: var(--aether-accent, #06b6d4); }
.subtitle { margin: 4px 0 0; font-size: 11px; color: var(--aether-muted, #94a3b8); }
.card {
  background: var(--aether-surface, #1e293b);
  border: 1px solid var(--aether-border, rgba(255,255,255,0.1));
  border-radius: 8px;
  padding: 14px;
}
.card h3 { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.counter-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.label { font-size: 12px; font-weight: 500; }
.value { font-size: 24px; font-weight: bold; color: var(--aether-accent, #06b6d4); font-family: monospace; }
.button-group { display: flex; gap: 8px; }
.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn:hover { opacity: 0.9; }
.btn-primary { background: var(--aether-accent, #06b6d4); color: #000; }
.btn-secondary { background: #334155; color: #fff; }
.btn-accent { background: #8b5cf6; color: #fff; }
.desc { font-size: 11px; color: var(--aether-muted, #94a3b8); margin: 0 0 10px; }
.footer { text-align: center; font-size: 10px; color: var(--aether-muted, #94a3b8); }`,
      'main.js': `let count = 0;
const counterEl = document.getElementById('counter');
const statusEl = document.getElementById('status');

async function init() {
  if (window.aether) {
    statusEl.textContent = 'Connected to Aether App SDK';
    try {
      const saved = await window.aether.storage.get('count');
      if (typeof saved === 'number') {
        count = saved;
        counterEl.textContent = count;
      }
    } catch (err) {
      statusEl.textContent = 'Storage: ' + err.message;
    }
  }
}

document.getElementById('btn-inc').addEventListener('click', async () => {
  count++;
  counterEl.textContent = count;
  if (window.aether) {
    try {
      await window.aether.storage.set('count', count);
      statusEl.textContent = 'Saved count: ' + count;
    } catch (err) {
      statusEl.textContent = 'Storage error: ' + err.message;
    }
  }
});

document.getElementById('btn-reset').addEventListener('click', async () => {
  count = 0;
  counterEl.textContent = count;
  if (window.aether) {
    try {
      await window.aether.storage.set('count', 0);
      statusEl.textContent = 'Counter reset';
    } catch (err) {
      statusEl.textContent = 'Reset error: ' + err.message;
    }
  }
});

document.getElementById('btn-notify').addEventListener('click', async () => {
  if (window.aether) {
    try {
      await window.aether.notifications.show({
        title: 'Hello from Hello Aether!',
        body: 'The current counter value is: ' + count,
      });
      statusEl.textContent = 'Notification sent successfully';
    } catch (err) {
      statusEl.textContent = 'Notification error: ' + err.message;
    }
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}`,
    },
  },
  {
    id: 'cli-tool',
    name: 'CLI Tool (Script Utility)',
    description: 'Command line script utility packaged for aesh.',
    type: 'cli',
    files: {
      'manifest.json': JSON.stringify(
        {
          schemaVersion: 1,
          id: 'dev.aether.clitool',
          name: 'CLI Tool',
          version: '1.0.0',
          description: 'AetherOS command line utility',
          author: 'Aether Developer',
          type: 'cli',
          entry: 'main.js',
          icon: 'Terminal',
          permissions: ['filesystem:read'],
          dependencies: {},
        } as AppManifest,
        null,
        2
      ),
      'main.js': `// AetherOS CLI Tool
console.log('CLI Tool v1.0.0 executed successfully!');
console.log('Arguments:', args || []);
`,
    },
  },
];
