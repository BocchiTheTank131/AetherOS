// AetherOS - Initial Linux Filesystem Skeleton & Default Files
import type { VFSNode } from './types';
import { getMimeType } from './mime';

export function createDefaultFileSystem(): Map<string, VFSNode> {
  const map = new Map<string, VFSNode>();
  const now = Date.now();

  const addDir = (path: string, owner = 'root', permissions = 0o755) => {
    const parts = path.split('/').filter(Boolean);
    const name = parts.length === 0 ? '/' : parts[parts.length - 1];
    const parentPath = parts.length <= 1 ? '/' : '/' + parts.slice(0, -1).join('/');

    const node: VFSNode = {
      name,
      path: path === '' ? '/' : path,
      parentPath,
      type: 'dir',
      size: 4096,
      createdAt: now,
      modifiedAt: now,
      permissions,
      owner,
      group: owner === 'root' ? 'root' : 'aether',
    };
    map.set(node.path, node);
  };

  const addFile = (
    path: string,
    content: string,
    owner = 'root',
    permissions = 0o644,
    isBinary = false
  ) => {
    const parts = path.split('/').filter(Boolean);
    const name = parts[parts.length - 1];
    const parentPath = parts.length === 1 ? '/' : '/' + parts.slice(0, -1).join('/');

    const node: VFSNode = {
      name,
      path,
      parentPath,
      type: 'file',
      content,
      size: isBinary ? Math.floor(content.length * 0.75) : new TextEncoder().encode(content).length,
      createdAt: now,
      modifiedAt: now,
      permissions,
      owner,
      group: owner === 'root' ? 'root' : 'aether',
      mimeType: getMimeType(name),
      isBinary,
    };
    map.set(path, node);
  };

  // Root & Standard Linux Directories
  addDir('/');
  addDir('/bin');
  addDir('/boot');
  addDir('/dev');
  addDir('/etc');
  addDir('/home');
  addDir('/home/aether', 'aether', 0o700);
  addDir('/home/aether/Desktop', 'aether', 0o755);
  addDir('/home/aether/Documents', 'aether', 0o755);
  addDir('/home/aether/Downloads', 'aether', 0o755);
  addDir('/home/aether/Music', 'aether', 0o755);
  addDir('/home/aether/Pictures', 'aether', 0o755);
  addDir('/home/aether/Videos', 'aether', 0o755);
  addDir('/home/aether/Projects', 'aether', 0o755);
  addDir('/home/aether/Projects/demo', 'aether', 0o755);
  addDir('/home/aether/bin', 'aether', 0o755);

  addFile(
    '/bin/aesh',
    '#!/bin/aesh\n# AetherOS Default Shell Binary Placeholder\n',
    'root',
    0o755
  );

  addFile(
    '/home/aether/Projects/demo/main.js',
    `// AetherOS Runtime Demo
console.log("Hello from AetherOS Secure Runtime!");
try {
  const text = await aether.fs.readText("/home/aether/Documents/GettingStarted.md");
  console.log(\`Successfully read GettingStarted.md (\${text.length} characters)\`);
  await aether.fs.writeText(
    "/home/aether/Documents/runtime_output.txt",
    \`[AetherOS Runtime Output]\\nProcessed at \${new Date().toISOString()}\\nDocument snippet:\\n\${text.slice(0, 80)}...\\n\`
  );
  console.log("Output successfully saved to /home/aether/Documents/runtime_output.txt");
} catch (err) {
  console.error("Runtime filesystem error:", err.message);
}
`,
    'aether',
    0o755
  );

  addFile(
    '/home/aether/Projects/demo/script.sh',
    `#!/bin/aesh
echo "Starting AetherOS script demonstration..."

for i in 1 2 3 4 5; do
    echo "Processing batch item $i"
done

if test -f /home/aether/Desktop/Welcome.txt; then
    echo "System verification: Welcome.txt detected."
else
    echo "Warning: Welcome.txt missing."
fi

echo "Script complete."
`,
    'aether',
    0o755
  );
  addDir('/home/aether/.config', 'aether', 0o700);
  addDir('/home/aether/.config/aetheros', 'aether', 0o700);
  addDir('/home/aether/.config/aesh', 'aether', 0o700);
  addDir('/home/aether/.local', 'aether', 0o700);
  addDir('/home/aether/.cache', 'aether', 0o700);
  addDir('/home/aether/.trash', 'aether', 0o700);

  addDir('/lib');
  addDir('/media');
  addDir('/mnt');
  addDir('/opt');
  addDir('/proc');
  addDir('/root', 'root', 0o700);
  addDir('/run');
  addDir('/sbin');
  addDir('/srv');
  addDir('/sys');
  addDir('/tmp', 'root', 0o777);
  addDir('/usr');
  addDir('/usr/bin');
  addDir('/usr/lib');
  addDir('/usr/local');
  addDir('/usr/share');
  addDir('/var');
  addDir('/var/log');
  addDir('/var/tmp', 'root', 0o777);

  // Configuration Files in /etc
  addFile('/etc/hostname', 'aetheros\n');
  addFile(
    '/etc/hosts',
    '127.0.0.1   localhost\n127.0.1.1   aetheros.local aetheros\n::1         localhost ip6-localhost ip6-loopback\n'
  );
  addFile(
    '/etc/os-release',
    `NAME="AetherOS"
VERSION="1.0 LTS (Quantum Breeze)"
ID=aetheros
ID_LIKE=linux
PRETTY_NAME="AetherOS 1.0 LTS"
VERSION_ID="1.0"
HOME_URL="https://aetheros.dev"
SUPPORT_URL="https://aetheros.dev/support"
BUG_REPORT_URL="https://aetheros.dev/issues"
`
  );

  addFile(
    '/etc/profile',
    `# /etc/profile: system-wide .profile file for the Bourne shell (sh(1))
# and Bourne compatible shells (bash(1), ksh(1), ash(1), aesh(1)).

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin"
export USER="aether"
export HOME="/home/aether"
export SHELL="/bin/aesh"
export TERM="xterm-256color"
`
  );

  // Shell RC & Config
  addFile(
    '/home/aether/.aeshrc',
    `# Aether Shell (.aeshrc) configuration
export PS1="\\u@\\h:\\w\\$ "
alias ll="ls -lah"
alias la="ls -A"
alias l="ls -CF"
alias cls="clear"
alias ..="cd .."
alias ...="cd ../.."
alias update="aetherpkg update"
`,
    'aether',
    0o644
  );

  // Desktop starter files
  addFile(
    '/home/aether/Desktop/Welcome.txt',
    `Welcome to AetherOS 1.0!
===================================
AetherOS is an advanced, fully functional, Linux-inspired browser-based operating system.

Key Highlights:
1. Real Persistent Filesystem: Any changes you make in Terminal, File Manager, or Text Editor persist via IndexedDB!
2. Full aesh Shell: Supports pipes (|), redirection (>, >>, <), variable expansion ($HOME, $USER), globbing (*.txt), and built-in Linux utilities.
3. Complete App Suite: File Manager, Code Studio, Terminal, Web Browser, System Monitor, Software Center, Media Player, Calculator, Notes, and Settings.
4. Window Management: Drag, resize, snap to edges (Super + Arrow), Alt+Tab switching, virtual workspaces, and quick runner (Alt+Space).
5. aetherpkg Package Manager: Install and manage additional packages from CLI or Software Center.

Try running 'fastfetch' in the Terminal or opening File Manager to explore the system!
`,
    'aether',
    0o644
  );

  // Documents
  addFile(
    '/home/aether/Documents/GettingStarted.md',
    `# Getting Started with AetherOS

AetherOS bridges the gap between web capabilities and traditional desktop computing.

## Command Line Tips
- \`fastfetch\` - Displays system hardware and software overview.
- \`ls -la\` - List files with permissions, owners, and sizes.
- \`cat /etc/os-release\` - Read distribution release details.
- \`ps\` or \`top\` - View running virtual processes and system statistics.
- \`aetherpkg list\` - View installed applications and available packages.
- \`help\` - Discover all available shell commands.

## Developing Web Apps in AetherOS
Navigate to \`/home/aether/Projects/web-demo\` and open **Code Studio**.
You can edit the HTML, CSS, and JavaScript files and preview your live application inside the sandbox window!
`,
    'aether',
    0o644
  );

  // Downloads sample
  addFile(
    '/home/aether/Downloads/sample_dataset.csv',
    `id,name,role,department,location
101,Elena Vance,Senior Systems Architect,Core Platform,San Francisco
102,Marcus Chen,Frontend Specialist,UI Experience,Seattle
103,Amina Diallo,Security Engineer,Security & Privacy,Berlin
104,Liam O'Connor,Kernel Programmer,Virtual Systems,Dublin
105,Sophia Rodriguez,UX Designer,Human Interface,Austin
`,
    'aether',
    0o644
  );

  // Pictures sample SVG vector graphic
  addFile(
    '/home/aether/Pictures/aether_constellation.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="50%" stop-color="#1a1c38" />
      <stop offset="100%" stop-color="#0a2a4a" />
    </linearGradient>
    <linearGradient id="cyan-glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00f2fe" />
      <stop offset="100%" stop-color="#4facfe" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" rx="16"/>
  <!-- Stars -->
  <circle cx="50" cy="40" r="1.5" fill="#fff" opacity="0.8"/>
  <circle cx="120" cy="80" r="2" fill="#fff" opacity="0.9"/>
  <circle cx="280" cy="50" r="1.5" fill="#fff" opacity="0.6"/>
  <circle cx="340" cy="110" r="2.5" fill="#fff" opacity="0.9"/>
  <circle cx="70" cy="220" r="1" fill="#fff" opacity="0.5"/>
  <circle cx="320" cy="240" r="1.8" fill="#fff" opacity="0.7"/>
  <!-- Constellation lines -->
  <path d="M 120 80 L 200 130 L 280 110 L 240 200 L 150 180 Z" stroke="url(#cyan-glow)" stroke-width="2" fill="none" opacity="0.75" />
  <!-- Nodes -->
  <circle cx="200" cy="130" r="6" fill="#00f2fe" />
  <circle cx="280" cy="110" r="5" fill="#4facfe" />
  <circle cx="240" cy="200" r="5.5" fill="#7f00ff" />
  <circle cx="150" cy="180" r="5" fill="#00f2fe" />
  <text x="200" y="260" font-family="system-ui, sans-serif" font-size="16" fill="#e2e8f0" text-anchor="middle" font-weight="600" letter-spacing="2">AETHER COSMOS</text>
</svg>`,
    'aether',
    0o644
  );

  // Web Demo Project Files
  addFile(
    '/home/aether/Projects/web-demo/index.html',
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AetherOS Web App Demo</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="card">
    <div class="badge">AetherOS Project</div>
    <h1>Hello from Code Studio!</h1>
    <p>This web application is running live from the AetherOS virtual filesystem inside an isolated sandbox iframe.</p>
    <div class="counter-box">
      <p>Current count: <span id="count">0</span></p>
      <button id="btn" class="btn">Click Me!</button>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
`,
    'aether',
    0o644
  );

  addFile(
    '/home/aether/Projects/web-demo/style.css',
    `body {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: linear-gradient(135deg, #0f172a, #1e1b4b);
  color: #f8fafc;
}

.card {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 2.5rem;
  border-radius: 1.25rem;
  text-align: center;
  max-width: 420px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

h1 {
  font-size: 1.6rem;
  margin-top: 0;
  color: #38bdf8;
}

p {
  color: #94a3b8;
  font-size: 0.95rem;
  line-height: 1.5;
}

.counter-box {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

#count {
  font-weight: bold;
  color: #38bdf8;
  font-size: 1.2rem;
}

.btn {
  margin-top: 0.75rem;
  padding: 0.6rem 1.4rem;
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: white;
  border: none;
  border-radius: 0.6rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
}

.btn:hover {
  transform: translateY(-2px);
  opacity: 0.95;
}
`,
    'aether',
    0o644
  );

  addFile(
    '/home/aether/Projects/web-demo/app.js',
    `let count = 0;
const countEl = document.getElementById('count');
const btn = document.getElementById('btn');

btn.addEventListener('click', () => {
  count++;
  countEl.textContent = count;
  btn.style.transform = 'scale(0.95)';
  setTimeout(() => {
    btn.style.transform = '';
  }, 100);
});
`,
    'aether',
    0o644
  );

  return map;
}
