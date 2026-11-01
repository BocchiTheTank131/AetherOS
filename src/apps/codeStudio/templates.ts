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
          version: '1.4.0',
          description: 'Interactive demonstration application for AetherOS v1.4',
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
      <p class="subtitle">AetherOS v1.4 Developer Workstation</p>
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
  {
    id: 'typescript-app',
    name: 'TypeScript Application Project',
    description: 'Modern TypeScript application with tsconfig.json, module imports, and build scripts.',
    type: 'cli',
    files: {
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            outDir: './dist',
            rootDir: './src',
            strict: true,
            noEmit: false,
          },
          include: ['src/**/*'],
        },
        null,
        2
      ),
      'aether.json': JSON.stringify(
        {
          name: 'typescript-demo',
          version: '1.0.0',
          language: 'typescript',
          entry: 'src/main.ts',
          outputDir: 'dist',
          scripts: {
            build: 'tsc -p tsconfig.json',
            run: 'js dist/main.js',
            test: 'tsc --noEmit',
          },
        },
        null,
        2
      ),
      'src/main.ts': `import { calculateSum, formatGreeting } from './utils';

interface User {
  id: number;
  name: string;
  role: string;
}

const developer: User = {
  id: 101,
  name: 'AetherOS Developer',
  role: 'Software Architect',
};

console.log(formatGreeting(developer.name));
console.log('Result of 25 + 17:', calculateSum(25, 17));
`,
      'src/utils.ts': `export function calculateSum(a: number, b: number): number {
  return a + b;
}

export function formatGreeting(name: string): string {
  return \`Welcome to AetherOS Developer Workstation, \${name}!\`;
}
`,
    },
  },
  {
    id: 'python-script',
    name: 'Python Script Project',
    description: 'Real Python project with pathlib file operations, mathematics, and unit tests.',
    type: 'cli',
    files: {
      'aether.json': JSON.stringify(
        {
          name: 'python-demo',
          version: '1.0.0',
          language: 'python',
          entry: 'main.py',
          scripts: {
            run: 'python main.py',
            test: 'python test_main.py',
          },
        },
        null,
        2
      ),
      'main.py': `from pathlib import Path
from utils import compute_fibonacci, format_report

print("Running Python on AetherOS v1.4 Developer Workstation!")

# Compute sequence
fib_numbers = compute_fibonacci(10)
report = format_report("Fibonacci First 10", fib_numbers)

# Write output file via pathlib
output_file = Path("results.txt")
output_file.write_text(report)
print(f"Results written to {output_file}:")
print(output_file.read_text())
`,
      'utils.py': `def compute_fibonacci(n: int) -> list:
    """Computes first n Fibonacci numbers."""
    if n <= 0:
        return []
    if n == 1:
        return [0]
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq

def format_report(title: str, data: list) -> str:
    items = ", ".join(str(x) for x in data)
    return f"=== {title} ===\\nValues: [{items}]\\nTotal: {sum(data)}"
`,
      'test_main.py': `from utils import compute_fibonacci

print("Running unit test assertions...")
seq = compute_fibonacci(5)
assert seq == [0, 1, 1, 2, 3], f"Unexpected sequence: {seq}"
assert sum(seq) == 7, "Sum calculation mismatch"
print("All unit tests passed successfully!")
`,
    },
  },
  {
    id: 'python-cli',
    name: 'Python CLI Utility',
    description: 'Command line utility with sys.argv argument parsing and file processing.',
    type: 'cli',
    files: {
      'cli.py': `import sys
from pathlib import Path

print(f"Executing CLI with arguments: {sys.argv}")

if len(sys.argv) < 2:
    print("Usage: python cli.py <filename>")
    target = Path("sample.txt")
    target.write_text("Hello from Python CLI on AetherOS!")
    print(f"Created default {target}: {target.read_text()}")
else:
    target_path = Path(sys.argv[1])
    target_path.write_text("Custom processed file output.")
    print(f"Wrote to {target_path}")
`,
      'README.md': `# Python CLI Utility for AetherOS

Execute with:
\`\`\`bash
python cli.py output.txt
\`\`\`
`,
    },
  },
  {
    id: 'html5-game',
    name: 'Canvas HTML5 Game',
    description: 'Interactive HTML5 Canvas particle physics game with AetherOS package manifest.',
    type: 'windowed',
    files: {
      'manifest.json': JSON.stringify(
        {
          schemaVersion: 1,
          id: 'dev.aether.particles',
          name: 'Particle Physics',
          version: '1.0.0',
          description: 'Interactive particle physics simulation for AetherOS',
          author: 'Aether Developer',
          type: 'windowed',
          entry: 'index.html',
          icon: 'Sparkles',
          window: {
            defaultWidth: 600,
            defaultHeight: 460,
            minWidth: 400,
            minHeight: 300,
            resizable: true,
          },
          permissions: [],
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
  <title>Particle Physics</title>
  <style>
    body { margin: 0; background: #0b0f19; overflow: hidden; display: flex; flex-direction: column; height: 100vh; }
    canvas { flex: 1; width: 100%; height: 100%; cursor: crosshair; }
    .hud { position: absolute; top: 8px; left: 8px; color: #38bdf8; font-family: monospace; font-size: 12px; pointer-events: none; }
  </style>
</head>
<body>
  <div class="hud">Click/drag to spawn particles! Count: <span id="count">0</span></div>
  <canvas id="canvas"></canvas>
  <script src="game.js"></script>
</body>
</html>`,
      'game.js': `const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const countEl = document.getElementById('count');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const particles = [];

function spawn(x, y) {
  for (let i = 0; i < 15; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: Math.random() * 3 + 2,
      color: 'hsl(' + Math.floor(Math.random() * 360) + ', 80%, 60%)',
      life: 1,
    });
  }
}

window.addEventListener('pointerdown', (e) => spawn(e.clientX, e.clientY));
window.addEventListener('pointermove', (e) => {
  if (e.buttons > 0) spawn(e.clientX, e.clientY);
});

// Initial spawn
spawn(canvas.width / 2, canvas.height / 2);

function loop() {
  ctx.fillStyle = 'rgba(11, 15, 25, 0.2)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05; // gravity
    p.life -= 0.01;

    if (p.life <= 0 || p.x < 0 || p.x > canvas.width || p.y > canvas.height) {
      particles.splice(i, 1);
      continue;
    }

    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  countEl.textContent = particles.length;
  requestAnimationFrame(loop);
}
loop();`,
    },
  },
];
