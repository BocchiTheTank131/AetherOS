# AGENTS.md — Developer & AI Agent Handbook for AetherOS

> **Audience:** AI Coding Agents (Antigravity, Claude, Codex) and Software Engineers working on AetherOS.  
> **Purpose:** Comprehensive architecture guide, component map, subsystem contracts, development workflows, coding invariants, and known pitfalls.

---

## 1. Project Overview & Philosophy

**AetherOS** is a browser-native, Linux-inspired operating environment. It does not emulate hardware CPU instructions (e.g. x86/ARM emulators); instead, it provides a high-fidelity **virtual operating environment** that implements authentic Linux paradigms running directly on web standards:
- **AetherCore:** Virtual kernel managing PID processes, signal handlers (`SIGTERM`, `SIGKILL`, `SIGSTOP`, `SIGCONT`), and resource stats.
- **AetherFS 2.0 (Virtual Filesystem):** Full Linux-compliant filesystem hierarchy (`/bin`, `/etc`, `/home/aether`, `/proc`, `/dev`, etc.) persisted in browser IndexedDB with binary-safe byte operations, POSIX virtual permissions (`checkAccess`), dynamic `/proc/<pid>` introspection, and SHA-256 backup verification.
- **AetherRuntime:** Isolated WebWorker sandbox execution engine for guest JavaScript with ambient capability lockdown, streaming stdout/stderr, execution timeouts (POSIX exit 124), cancellation, and a guest `aether.fs` bridge.
- **aesh (Aether Shell):** POSIX-compliant command shell with lexer, recursive descent AST parser, pipelines (`|`), input/output redirections (`>`, `>>`, `<`, `2>`), conditional chaining (`&&`, `||`, `;`), control structures (`if/then/elif/else/fi`, `for`, `while`, `case/esac`), shell functions, background job control (`&`, `jobs`, `fg`, `bg`, `wait`), environment variables, globbing, and 50+ built-in utilities.
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
- **Testing:** Vitest 5 (109 passed automated tests)
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
│   ├── version.ts         # Canonical AETHER_VERSION single source of truth
│   ├── performanceService.ts # Centralized performance telemetry & sampling
│   ├── types.ts           # Process, user, theme, event interfaces
│   ├── eventBus.ts        # Typed system-wide pub/sub event bus
│   ├── kernel.ts          # VirtualKernel: PID table, signal dispatcher, uptime
│   ├── logger.ts          # SystemLogger: structured circular buffer (dmesg / journalctl)
│   ├── audio.ts           # AudioService: Web Audio API procedural sound synthesizer
│   └── context.tsx        # SystemProvider & useSystem() OS context hook
│
├── runtime/               # Secure Isolated Guest Execution Engine
│   ├── types.ts           # Runtime execution interfaces, options, and events
│   ├── AetherRuntime.ts   # WebWorker guest runtime orchestrator
│   ├── workers/
│   │   └── sandboxSource.ts # Hardened worker sandbox with stripped ambient APIs
│   └── api/
│       └── guestFs.ts     # Sandboxed guest aether.fs RPC bridge
│
├── vfs/                   # Virtual Filesystem Engine (AetherFS 2.0)
│   ├── types.ts           # VFSNode, VFSEntry, VFSStats, VFSWatchCallback interfaces
│   ├── vfs.ts             # VirtualFileSystem: POSIX operations, /proc/<pid> & /dev dynamic nodes
│   ├── idbStorage.ts      # IndexedDB batch persistence engine with write-behind queues
│   ├── initFs.ts          # Default Linux filesystem skeleton & default files
│   ├── mime.ts            # Extension-to-MIME detection & default app associations
│   └── searchIndexer.ts   # Incremental file indexer for Command Palette
│
├── shell/                 # aesh Command Shell & Terminal Engine
│   ├── types.ts           # Tokens, AST nodes, ExecutionResult, ShellContext
│   ├── lexer.ts           # Shell tokenizer (quotes, escapes, operators)
│   ├── parser.ts          # AST parser (pipelines, redirections, logical chains, scripting AST)
│   ├── environment.ts     # Variable expansion ($HOME, $?) & glob expansion (*.txt)
│   ├── registry.ts        # Central command registry
│   ├── executor.ts        # Pipeline & redirection execution runtime
│   └── commands/          # Built-in Linux commands
│       ├── fsCommands.ts  # ls, cd, pwd, mkdir, rmdir, touch, cat, cp, mv, rm, tree, find, grep, etc.
│       ├── sysCommands.ts # ps, top, htop, kill, killall, uptime, whoami, uname, free, fastfetch, dmesg
│       ├── textCommands.ts# echo, printf, clear, history, alias, export, env, which, date, seq, etc.
│       ├── scriptCommands.ts # jobs, fg, bg, wait, source, test, [
│       ├── netCommands.ts # ping, curl, wget
│       ├── devCommands.ts # base64, sha256sum, md5sum, jq, js, node
│       └── pkgCommands.ts # aetherpkg CLI interface
│
├── pkg/                   # Package Management Subsystem (.aepkg & repository)
│   ├── types.ts           # AetherPackage & PackageRecord interfaces
│   ├── repository.ts      # OFFICIAL_REPOSITORY package catalog
│   ├── packageArchive.ts  # Binary-safe zip pack/unpack with path traversal guards
│   ├── packageIntegrity.ts# SHA-256 integrity manifest generation & verification
│   ├── packageValidator.ts# Archive structure, manifest, and security validation
│   ├── packageResolver.ts # Semver comparison and dependency resolution
│   ├── packageRollback.ts # Snapshot history and rollback orchestration
│   ├── packageInstaller.ts# Atomic staging (/opt/aether/apps/) & registration
│   └── packageManager.ts  # Unified package manager API
│
├── appPlatform/           # Dynamic Application Platform & Sandbox
│   ├── AppManifest.ts     # Schema validation for third-party manifest.json
│   ├── AppPermissions.ts  # 13 granular permission scopes and risk levels
│   ├── PermissionManager.ts# Permission grants, persistence (/var/lib/aetherpkg/)
│   ├── AppStorage.ts      # App-private storage (/home/aether/.local/share/aether/apps/)
│   ├── AppProtocol.ts     # Typed RPC message envelope and rate limiting
│   ├── DynamicAppRegistry.ts # Dynamic app registry (/var/lib/aetherpkg/installed_v2.json)
│   ├── FileAssociations.ts# File extensions and MIME associations
│   ├── AppHost.tsx        # Sandboxed iframe host (allow-scripts without allow-same-origin)
│   └── sdk/               # Guest App SDK (window.aether bridge)
│
├── session/               # Desktop Session Management
│   └── SessionManager.ts  # Workspace & window state persistence (/home/aether/.config/aetheros/session.json)
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
- Scripting engine: Evaluates control structures (`if`, `for`, `while`, `case`), shell functions, and background job launching (`&`).

### 4.5 Aether Runtime (`aetherRuntime`)
Located at `src/runtime/AetherRuntime.ts`.
- `aetherRuntime.execute(options)`: Spawns an isolated WebWorker task, maps a kernel PID, binds stdout/stderr streams, enforces timeouts (exit code 124), and terminates with `worker.terminate()`.
- Provides an asynchronous bridge (`aether.fs`) into VFS for guest scripts.
- Strips ambient web APIs in `sandboxSource.ts` to ensure guest confinement.

### 4.6 Performance Service (`performanceService`)
Located at `src/core/performanceService.ts`.
- Real-time telemetry provider aggregating host browser JS heap (via `performance.memory` where supported), kernel process allocations, active worker counts, and execution metrics.
- Manages a sliding 60-sample historical window for UI charts.
- Subscriptions pause timers when no listeners are attached to conserve CPU cycles.
- `performanceService.measureTask(label, fn)`: Measures asynchronous execution latency.

### 4.7 POSIX Job Control
Located at `src/shell/jobControl.ts` and `src/shell/commands/scriptCommands.ts`.
- Background tasks (`cmd &`) register as managed jobs.
- `jobs`: Lists active background jobs and execution states.
- `fg` / `bg`: Toggles execution between foreground and background.
- `wait`: Awaits completion of specific background PIDs or all active jobs.

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

### ⚠️ Invariant 6: Ambient Capability Lockdown in Guest Sandboxes
- In `sandboxSource.ts`, never expose ambient network, storage, or worker constructors (`fetch`, `XMLHttpRequest`, `WebSocket`, `Worker`, `BroadcastChannel`, `Notification`, `indexedDB`, `importScripts`) inside the guest evaluation scope.
- Post-message transport listeners must be captured within a secure closure and deleted from the global scope prior to code evaluation.

### ⚠️ Invariant 7: Honest Telemetry (No Arbitrary Synthetic Math.random() Jitter)
- Do not inject arbitrary `Math.random()` numbers into system telemetry or process statistics.
- Metrics must reflect real host heap measurements (where supported) or deterministic virtual kernel process accounting via `performanceService`.

### ⚠️ Invariant 8: Centralized Versioning
- Never hardcode OS version strings in UI components, terminal banners, or CLI outputs.
- Always import and reference `AETHER_VERSION` from `src/core/version.ts`.

### ⚠️ Invariant 9: Third-Party Application Sandboxing (`AppHost`)
- Third-party installed apps run in `src/appPlatform/AppHost.tsx` via Blob URLs inside an `<iframe>` with `sandbox="allow-scripts"` and **NEVER** `allow-same-origin`.
- RPC communication is strictly mediated across an explicit `MessageChannel` port with authenticated session tokens and rate limits.
- Third-party apps must never be granted raw access to `vfs`, `virtualKernel`, or host browser global state.
- Filesystem access must strictly pass through `PermissionManager` checks.

### ⚠️ Invariant 10: App Launcher & Dock Icon Constraining
- All Lucide icon components or image elements displayed in constrained areas (e.g. Recent Applications row, Dock, Window titlebar) must specify explicit `size` props or constraints alongside CSS classes (e.g. `size={14}` and `w-3.5 h-3.5`) to prevent presentation overflow or text collisions.

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
