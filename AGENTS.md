# AGENTS.md — Developer & AI Agent Handbook for AetherOS

> **Audience:** AI Coding Agents (Antigravity, Claude, Codex) and Software Engineers working on AetherOS.  
> **Purpose:** Comprehensive architecture guide, component map, subsystem contracts, development workflows, coding invariants, and known pitfalls.

---

## 1. Project Overview & Philosophy

**AetherOS** is a browser-native, Linux-inspired operating environment. It does not emulate hardware CPU instructions (e.g. x86/ARM emulators); instead, it provides a high-fidelity **virtual operating environment** that implements authentic Linux paradigms running directly on web standards:
- **AetherCore:** Virtual kernel managing PID processes, signal handlers (`SIGTERM`, `SIGKILL`, `SIGSTOP`, `SIGCONT`), and resource stats.
- **VFS (Virtual Filesystem):** Full Linux-compliant filesystem hierarchy (`/bin`, `/etc`, `/home/aether`, `/proc`, `/dev`, etc.) persisted in browser IndexedDB.
- **aesh (Aether Shell):** POSIX-like command shell with tokenization, AST parser, pipelines (`|`), input/output redirections (`>`, `>>`, `<`, `2>`), conditional chaining (`&&`, `||`, `;`), environment variables, globbing, and 40+ built-in utilities.
- **AetherWM & Desktop:** Multi-window compositor with 8-direction resizing, dragging, snapping, 4 virtual workspaces, dock/taskbar, app launcher, quick runner, and notification drawer.
- **App Platform & aetherpkg:** Central registry for 14 core system applications, plus an official package manager (`aetherpkg`) supporting installable modules.

---

## 2. Technology Stack & Key Commands

- **Language:** TypeScript 5.8+ / 7.0 (Strict mode, ES Modules)
- **Framework:** React 19 + React DOM 19
- **Bundler & Tooling:** Vite 8, `@vitejs/plugin-react`
- **Styling:** Tailwind CSS 4 (`@tailwindcss/vite`), Lucide React icons
- **Audio:** Web Audio API (procedural oscillator synthesizer)
- **Storage:** Browser IndexedDB (primary persistence) with in-memory VFS caching
- **Testing:** Vitest 5
- **Linter:** Oxlint

### Essential Commands

```bash
# Start local development server (http://localhost:5173/)
npm run dev

# Run unit and integration tests
npm test

# Run code linter
npm run lint

# Production build and typecheck
npm run build

# Preview production build locally
npm run preview
```

---

## 3. Directory Structure & Subsystem Map

```text
src/
├── core/                  # Core OS Foundation & Services
│   ├── types.ts           # Process, user, theme, event interfaces
│   ├── eventBus.ts        # Typed system-wide pub/sub event bus
│   ├── kernel.ts          # VirtualKernel: PID table, signal dispatcher, uptime
│   ├── logger.ts          # SystemLogger: structured circular buffer (dmesg / journalctl)
│   ├── audio.ts           # AudioService: Web Audio API procedural sound synthesizer
│   └── context.tsx        # SystemProvider & useSystem() OS context hook
│
├── vfs/                   # Virtual Filesystem Engine
│   ├── types.ts           # VFSNode, VFSEntry, VFSStats, VFSWatchCallback interfaces
│   ├── vfs.ts             # VirtualFileSystem: POSIX operations, /proc & /dev dynamic nodes
│   ├── idbStorage.ts      # IndexedDB batch persistence engine with write-behind queues
│   ├── initFs.ts          # Default Linux filesystem skeleton & default files
│   ├── mime.ts            # Extension-to-MIME detection & default app associations
│   └── searchIndexer.ts   # Incremental file indexer for Command Palette
│
├── shell/                 # aesh Command Shell & Terminal Engine
│   ├── types.ts           # Tokens, AST nodes, ExecutionResult, ShellContext
│   ├── lexer.ts           # Shell tokenizer (quotes, escapes, operators)
│   ├── parser.ts          # AST parser (pipelines, redirections, logical chains)
│   ├── environment.ts     # Variable expansion ($HOME, $?) & glob expansion (*.txt)
│   ├── registry.ts        # Central command registry
│   ├── executor.ts        # Pipeline & redirection execution runtime
│   └── commands/          # Built-in Linux commands
│       ├── fsCommands.ts  # ls, cd, pwd, mkdir, rmdir, touch, cat, cp, mv, rm, tree, find, grep, etc.
│       ├── sysCommands.ts # ps, top, htop, kill, killall, uptime, whoami, uname, free, fastfetch, dmesg
│       ├── textCommands.ts# echo, printf, clear, history, alias, export, env, which, date, seq, etc.
│       ├── netCommands.ts # ping, curl, wget
│       ├── devCommands.ts # base64, sha256sum, md5sum, jq, js, node
│       └── pkgCommands.ts # aetherpkg CLI interface
│
├── pkg/                   # Package Management Subsystem
│   ├── types.ts           # AetherPackage interface
│   ├── repository.ts      # OFFICIAL_REPOSITORY package catalog
│   └── packageManager.ts  # PackageManager: install, remove, query (/var/lib/aetherpkg/)
│
├── desktop/               # Desktop Environment & Compositor
│   ├── types.ts           # WindowInstance, WindowDisplayState, Workspace interfaces
│   └── components/
│       ├── Desktop.tsx            # Desktop wallpaper, icon grid, right-click context menu
│       ├── WindowFrame.tsx        # Composited window: draggable titlebar, 8-dir resize, controls
│       ├── Taskbar.tsx            # Dock, running app badges, tray, clock, workspace switcher
│       ├── AppLauncher.tsx        # Start menu with categories, search, user profile, power
│       ├── CommandPalette.tsx     # Alt+Space quick runner (apps, files, shell commands)
│       ├── NotificationCenter.tsx # Toast alerts and slide-out notification drawer
│       ├── QuickSettings.tsx      # System tray quick settings (volume, dark/light, wifi, power)
│       ├── BootScreen.tsx         # Linux boot splash & systemd unit startup log animation
│       └── LockScreen.tsx         # User authentication lock screen
│
└── apps/                  # Application Platform & Native Suite
    ├── types.ts           # AppProps & AppDefinition interfaces
    ├── appRegistry.ts     # Central application catalog
    ├── terminal/          # TerminalApp (multi-tab aesh frontend)
    ├── fileManager/       # FileManagerApp (Files browser, breadcrumbs, upload)
    ├── textEditor/        # TextEditorApp (multi-tab plain text / config editor)
    ├── codeStudio/        # CodeStudioApp (IDE with live iframe sandbox preview)
    ├── webBrowser/        # WebBrowserApp (Tabbed browser with security sandbox)
    ├── settings/          # SettingsApp (Appearance, dock position, storage backup, about)
    ├── systemMonitor/     # SystemMonitorApp (Processes, live canvas CPU/Mem charts, services)
    ├── softwareCenter/    # SoftwareCenterApp (GUI frontend for aetherpkg)
    ├── calculator/        # CalculatorApp (Standard & scientific calculation)
    ├── mediaPlayer/       # MediaPlayerApp (Synthesized audio & media playback)
    ├── imageViewer/       # ImageViewerApp (Image inspector with zoom & rotation)
    ├── notes/             # NotesApp (Categorized notes & to-do checklists)
    ├── documentViewer/    # DocumentViewerApp (Markdown documentation reader)
    ├── logViewer/         # LogViewerApp (journalctl / dmesg viewer)
    ├── games/             # MinesweeperApp & Game2048App
    ├── paint/             # PaintApp (Canvas sketching & PNG export)
    └── weather/           # WeatherApp (Live Open-Meteo station forecast)
```

---

## 4. Key Subsystem Contracts & APIs

### 4.1 SystemContext (`useSystem()`)
The primary bridge between the OS and the UI components.
```ts
const {
  booted,
  theme, setTheme,           // SystemTheme (mode, accentColor, wallpaper, dockPosition, etc.)
  user, setUser,             // UserAccount (username, displayName, role, homeDir)
  isLocked, setIsLocked,     // Screen lock state
  windows,                   // WindowInstance[]
  openWindow,                // (appId: string, props?: Record<string, unknown>) => string
  closeWindow,               // (id: string) => void
  focusWindow,               // (id: string) => void
  minimizeWindow,            // (id: string) => void
  maximizeWindow,            // (id: string) => void
  snapWindow,                // (id: string, side: 'left' | 'right') => void
  updateWindowPosition,      // (id: string, x: number, y: number) => void
  updateWindowSize,          // (id: string, width: number, height: number, x?: number, y?: number) => void
  activeWorkspace,           // number (1..4)
  setActiveWorkspace,        // (id: number) => void
  notifications,             // SystemNotification[]
  addNotification,           // (notif) => void
  dismissNotification,       // (id: string) => void
  clearNotifications,        // () => void
  rebootSystem,              // () => void
  shutdownSystem,            // () => void
} = useSystem();
```

### 4.2 Virtual Kernel (`virtualKernel`)
Located at `src/core/kernel.ts`.
- `virtualKernel.spawn(options)`: Allocates next PID (starts at 100), creates a `Process`, logs to `systemLogger`, and emits `process:started`.
- `virtualKernel.exit(pid, exitCode)`: Runs cleanup hooks, sets state to `'terminated'`, deletes from process table, and emits `process:terminated`.
- `virtualKernel.kill(pid, signal)`: Supports `SIGKILL`, `SIGTERM`, `SIGINT` (which exit), and `SIGSTOP`, `SIGCONT` (which pause/resume process).
- `virtualKernel.getProcesses()`: Returns all active processes.
- `virtualKernel.getTotalMemoryUsage()` & `virtualKernel.getAverageCpuUsage()`: Aggregates real-time virtual system metrics.

### 4.3 Virtual Filesystem (`vfs`)
Located at `src/vfs/vfs.ts`.
- **Paths:** Always use absolute POSIX paths (e.g. `/home/aether`). Use `vfs.resolve(cwd, path)` to resolve relative paths and `vfs.normalizePath(path)` to resolve `.`, `..`, and repeated slashes.
- **Dynamic nodes:**
  - `/proc`: `/proc/version`, `/proc/uptime`, `/proc/meminfo`, `/proc/cpuinfo`.
  - `/dev`: `/dev/null`, `/dev/zero`, `/dev/urandom`, `/dev/random`.
  These are synthesized on read and never saved to IndexedDB.
- **Core methods:**
  - `vfs.exists(path)`: boolean.
  - `vfs.stat(path)`: Returns `VFSStats` with `.isDirectory()`, `.isFile()`, `.isSymbolicLink()`.
  - `vfs.readFile(path)`: string.
  - `vfs.writeFile(path, content, options?)`: Writes file, queues IndexedDB save, notifies watchers.
  - `vfs.mkdir(path, options?)`: Creates directory.
  - `vfs.readdir(path)`: Returns sorted `VFSEntry[]` (directories first).
  - `vfs.unlink(path)` / `vfs.rmdir(path, { recursive })`.
  - `vfs.rename(oldPath, newPath)` / `vfs.copy(src, dest, { recursive })`.
  - `vfs.watch(pathOrPrefix, callback)`: Subscribes to changes under path. Returns unsubscribe function.
  - `vfs.moveToTrash(path)` / `vfs.emptyTrash()`.

### 4.4 Shell Executor (`shellExecutor`)
Located at `src/shell/executor.ts`.
- `shellExecutor.execute(commandString, shellContext)`: Executes a pipeline or logical chain asynchronously, returns `{ stdout, stderr, exitCode }`.
- Automatically handles variable expansion, globbing, alias expansion, redirection, and kernel process lifecycle tracking.

---

## 5. Critical Invariants & Rules for Agents

When implementing changes or fixing bugs in AetherOS, **you must observe the following invariants**:

### ⚠️ Invariant 1: No Unconstrained Global Keyboard Listeners
Never attach a global `window.addEventListener('keydown', ...)` inside an application component without:
1. Checking if the component's window is focused.
2. Checking if `e.target` is an input, textarea, or contentEditable element (to prevent stealing characters while the user is typing).
3. Ensuring cleanup in `useEffect` return handler.
*See bug in `Game2048App.tsx` and `CalculatorApp.tsx` where unconstrained listeners broke keyboard input system-wide.*

### ⚠️ Invariant 2: Preserving VFS & Package Synchronization
- When the system starts up, `vfs.init()` MUST be accompanied by `packageManager.init()`.
- Every VFS mutation should notify watchers using `vfs.notifyWatchers(...)`.
- When mutating files in a loop, avoid reassigning shared destination path variables (see `mv` bug in `fsCommands.ts`).

### ⚠️ Invariant 3: Window State Updates Must Be Pure
- Do not mutate `win.title` directly (e.g. `win.title = t;` in `WindowFrame.tsx`). State in React must be updated through the state setters provided by `SystemContext`.
- Avoid calling `setWindows(...)` inside another `setWindows(...)` updater (see `Alt+Tab` bug in `context.tsx`).

### ⚠️ Invariant 4: Sandbox Isolation for Web Content
- In `WebBrowserApp.tsx` and `CodeStudioApp.tsx`, **never** combine `allow-scripts` and `allow-same-origin` on an `<iframe>` unless it is hosted on an isolated distinct domain. Doing so allows framed scripts to access `window.parent` and compromise the OS.

### ⚠️ Invariant 5: Clean Up Web Audio & Object URLs
- When using `AudioContext` in apps, close the context or disconnect nodes on unmount to avoid hitting the browser's maximum AudioContext limit.
- When generating `URL.createObjectURL(blob)` (in `ImageViewerApp`, `LogViewerApp`, or `SettingsApp`), always invoke `URL.revokeObjectURL(url)` after use to prevent memory leaks.

---

## 6. How-To Guides for Common Extensions

### 6.1 How to Add a New Native Application

1. **Create the component:**
   Create `src/apps/myApp/MyApp.tsx`:
   ```tsx
   import React from 'react';
   import type { AppProps } from '../types';

   export const MyApp: React.FC<AppProps> = ({ windowId, setTitle }) => {
     return (
       <div className="flex flex-col h-full bg-[#111827] text-white p-4">
         <h1 className="text-lg font-bold">My New Application</h1>
       </div>
     );
   };
   ```

2. **Register the application in `src/apps/appRegistry.ts`:**
   Import `MyApp` and append an entry to `registerCoreApps()`:
   ```ts
   {
     id: 'my-app',
     name: 'My App',
     icon: 'Sparkles', // Lucide icon name
     category: 'Accessories',
     description: 'Description of what this app does',
     component: MyApp,
     defaultWidth: 700,
     defaultHeight: 480,
     minWidth: 400,
     minHeight: 300,
     executable: '/usr/bin/my-app',
   }
   ```

3. **(Optional) Add icon mapping:**
   If using a custom Lucide icon, add it to `getAppIcon` in:
   - `src/desktop/components/WindowFrame.tsx`
   - `src/desktop/components/AppLauncher.tsx`

4. **(Optional) Add to Desktop shortcuts:**
   Add an entry in `desktopIcons` inside `src/desktop/components/Desktop.tsx` if you want it pinned on the desktop surface.

---

### 6.2 How to Add an Installable Package to `aetherpkg`

1. **Add definition to `src/pkg/repository.ts`:**
   ```ts
   {
     id: 'my-package',
     name: 'My Cool Package',
     version: '1.0.0',
     description: 'A great tool installable via aetherpkg',
     author: 'Developer',
     category: 'Utilities',
     icon: 'Terminal',
     sizeKb: 120,
     permissions: ['storage:read', 'storage:write'],
     installed: false,
     appId: 'my-app', // Must match an existing appId in appRegistry!
   }
   ```

2. Verify that `appRegistry.ts` contains an entry matching `appId`.

---

### 6.3 How to Add a New Shell Built-in Command to `aesh`

1. **Define the command:**
   Open the appropriate command file in `src/shell/commands/` (e.g. `fsCommands.ts`, `sysCommands.ts`, `textCommands.ts`, etc.):
   ```ts
   {
     name: 'mycmd',
     description: 'Demonstrate custom command',
     usage: 'mycmd [-v] <target>',
     manual: 'mycmd - detailed help description',
     execute: (args, context, stdin): ExecutionResult => {
       if (args.length === 0) {
         return { stdout: '', stderr: 'mycmd: missing operand\n', exitCode: 1 };
       }
       return { stdout: `Executed on: ${args[0]}\n`, stderr: '', exitCode: 0 };
     },
   }
   ```
2. The command will be automatically registered when `commandRegistry` initializes.
3. Test using `npm test` or by typing `mycmd` in the terminal.

---

## 7. Known Issues & Audit Reference

For a complete catalog of all 44 identified issues, root cause analyses, and line references, consult [CODE_REVIEW_REPORT.md](file:///c:/Users/Win/Documents/AetherOS/CODE_REVIEW_REPORT.md).

### Top 5 Priority Bugs to Keep in Mind:
1. `Game2048App.tsx`: Keydown listener must be scoped to window focus to stop swallowing WASD/arrow keys.
2. `CalculatorApp.tsx`: Keydown effect is missing `[]` and captures global typing.
3. `App.tsx`: Calling `shutdownSystem` sets `booted=false`, causing immediate re-mount of `BootScreen` (reboot loop).
4. `context.tsx`: `packageManager.init()` is never called on boot, discarding installed package status on refresh.
5. `vfs.ts`: `vfs.mkdir` throws `EEXIST` even with `recursive: true`, breaking `mkdir -p` and `vfs.copy`.

---

## 8. Verification & QA Protocol

Before submitting or committing any code changes:
1. Run `npm test` to ensure all existing unit and integration tests pass.
2. Run `npm run lint` (`oxlint`) to ensure no new warnings or errors are introduced.
3. Run `npm run build` (`tsc -b && vite build`) to confirm zero TypeScript compilation errors.
4. Manually test in the browser:
   - Launch Terminal, type commands (`ls`, `cd`, `cat`, `top`, `aetherpkg list`).
   - Launch Calculator, 2048, and Text Editor simultaneously; verify that typing in the Text Editor is not intercepted by background apps.
   - Install a package via Software Center, refresh the browser, and confirm the package remains installed.
