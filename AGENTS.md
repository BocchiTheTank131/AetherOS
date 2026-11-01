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
- **Testing:** Vitest 5 (141 passed automated tests across 9 test suites)
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
│   ├── dialog.ts          # Centralized System Dialog Service (alert, confirm, prompt)
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
├── runtimes/              # Language Runtimes & Compilers
│   ├── python/            # Python Execution Subsystem (Pyodide WebAssembly)
│   │   ├── types.ts       # Python execution options, messages, results
│   │   ├── pythonWorkerSource.ts # Hardened Pyodide worker sandbox
│   │   ├── PythonFileBridge.ts   # Bidirectional VFS <-> MEMFS sync bridge
│   │   ├── PythonSession.ts      # Session lifecycle, PID tracking, timeouts
│   │   └── PythonRuntime.ts      # Multi-session coordinator
│   └── typescript/        # TypeScript Compiler & Language Intelligence
│       ├── types.ts       # Diagnostics, completions, hover types
│       ├── TypeScriptCompiler.ts # Transpiler, semantic analyzer, module bundler
│       └── TypeScriptService.ts  # Autocomplete, definition, hover provider
│
├── git/                   # Local Git Version Control Subsystem (isomorphic-git)
│   ├── GitFileSystemAdapter.ts # POSIX adapter binding isomorphic-git to VFS
│   ├── GitDiff.ts         # Unified line-by-line diff engine & patch generator
│   └── GitService.ts      # High-level Git API (init, status, add, commit, log, diff, branch, checkout)
│
├── developer/             # Developer Subsystem & Project Management
│   ├── types.ts           # ProjectConfig, TaskDefinition, TaskExecution
│   ├── ProjectManager.ts  # Workspace detection and project discovery
│   └── TaskManager.ts     # Script and build task runner with exit code handling
│
├── editor/                # Modular Code Editor Engine
│   ├── types.ts           # Editor position, selection, search options
│   ├── syntaxHighlight.ts # Multi-language tokenizer (TS, JS, Py, HTML, CSS, JSON, Shell, MD)
│   └── EditorHost.tsx     # Professional editor host with gutters, brackets, search/replace, go-to-line
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
│       ├── gitCommands.ts # git (init, status, add, commit, log, diff, branch, checkout, restore)
│       ├── pythonCommands.ts # python, python3 (-c, script execution, stdlib)
│       ├── tscCommands.ts # tsc (transpilation, type-checking, multi-file bundling)
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
│       ├── DialogHost.tsx         # Centralized System Modal Dialog Host
│       ├── AppErrorBoundary.tsx   # Per-window crash recovery & error boundary
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

### 4.8 Local Git Subsystem (`gitService`)
Located at `src/git/GitService.ts` and `src/git/GitFileSystemAdapter.ts`.
- Powered by `isomorphic-git` running entirely in the browser on top of `AetherFS 2.0`.
- Provides 10-method POSIX filesystem adapter: `readFile`, `writeFile`, `mkdir`, `rmdir`, `unlink`, `stat`, `lstat`, `readdir`, `readlink`, `symlink`.
- Methods:
  - `gitService.init(dir, defaultBranch?)`: Initializes a new Git repository.
  - `gitService.status(dir)`: Returns staged, modified, unstaged, and untracked file statuses.
  - `gitService.add(dir, filepath)` / `gitService.remove(dir, filepath)`.
  - `gitService.commit(dir, message, author?)`: Creates SHA-1 commits and updates branch head.
  - `gitService.log(dir, depth?)`: Reads commit history with commit IDs, timestamps, and messages.
  - `gitService.diff(dir, filepath?)`: Computes line-by-line diffs via `GitDiff.ts` with additions/deletions.
  - `gitService.branch(dir, branchName)` / `gitService.checkout(dir, ref)`: Manages and checks out branches.
  - `gitService.restore(dir, filepath)`: Restores modified files from HEAD index.

### 4.9 Real Python Runtime Subsystem (`pythonRuntime`)
Located at `src/runtimes/python/PythonRuntime.ts`.
- Powered by Pyodide WebAssembly with isolated WebWorker execution and ambient API stripping.
- Bidirectional VFS synchronization via `PythonFileBridge`: synchronizes project files to Pyodide MEMFS prior to execution, and synchronizes modified/created files back to `AetherFS` on completion.
- Session lifecycle with kernel PID integration, output streaming (stdout/stderr), POSIX timeout handling (exit code 124), and abort signal cancellation.
- CLI: `python <script.py>`, `python -c "code"`, `python --version`.

### 4.10 TypeScript Compiler & Intelligence Subsystem
Located at `src/runtimes/typescript/TypeScriptCompiler.ts` and `TypeScriptService.ts`.
- `typeScriptCompiler.transpile(code)`: Fast in-browser AST transpile stripping types, interfaces, enums, type assertions, and decorators.
- `typeScriptCompiler.typeCheck(filename, code)`: Semantic analyzer detecting undeclared variables (`TS2304`), type mismatch assignments (`TS2322`), and syntax errors (`TS1005`).
- `typeScriptCompiler.bundleProject(entryPath)`: Multi-file module bundler resolving relative ES imports and building a self-contained runtime bundle in `dist/main.js`.
- `typeScriptService.getCompletions(code, line, col)`: Language intelligence providing keyword and scoped symbol autocompletions.
- CLI: `tsc <file.ts>`, `tsc --noEmit`, `tsc -p tsconfig.json`.

### 4.11 Project & Task Management Subsystems
Located at `src/developer/ProjectManager.ts` and `src/developer/TaskManager.ts`.
- `projectManager.findProjects(root)`: Discovers projects by inspecting `manifest.json`, `package.json`, `tsconfig.json`, or `.git`.
- `taskManager.getTasks(projectRoot)`: Extracts tasks defined in `package.json` (`scripts`) or `manifest.json`.
- `taskManager.runTask(task, onOutput)`: Executes build/test/run tasks via `shellExecutor` with real-time output streaming.

### 4.12 Code Studio 2.0 & Syntax Highlighting Engine
Located at `src/apps/codeStudio/CodeStudioApp.tsx` and `src/editor/EditorHost.tsx`.
- Activity Bar with 5 workbench modes: Files Explorer, Git Source Control, Full-text Search, Problems / Diagnostics, and Build Tasks.
- Multi-tab file editor with dirty state indicator dots and split editing (horizontal and vertical).
- `EditorHost`: Syntax highlighting for TypeScript, JavaScript, Python, HTML, CSS, JSON, Shell, Markdown, and Plain text; active line highlight, line number gutter, auto-indent, bracket closing, `Ctrl+F` find/replace modal, `Ctrl+G` go-to-line modal.
- Integrated `StudioTerminal`: Full `aesh` shell instance bound to project root directory.
- `StudioDiffViewer`: Unified diff inspector with green addition and red deletion line coloring.
- Direct packaging to `.aepkg` with host download and one-click desktop installation.

### 4.13 System Dialog Service (`dialogService`)
Located at `src/core/dialog.ts` and `src/desktop/components/DialogHost.tsx`.
- Centralized system dialog manager replacing native browser `alert()`, `confirm()`, and `prompt()` modals across all applications.
- Features Tab/Shift+Tab focus trapping, Enter to confirm, Escape to cancel, status levels (`info`, `success`, `warning`, `error`), and validation hooks.
- Asynchronous Promise API:
  - `dialogService.alert({ title?, message, level?, okText? })`: Promise<void>
  - `dialogService.confirm({ title?, message, confirmText?, cancelText?, danger? })`: Promise<boolean>
  - `dialogService.prompt({ title?, message, defaultValue?, placeholder?, validate? })`: Promise<string | null>
  - `dialogService.isOpen()`: boolean

### 4.14 Application Crash Boundary (`AppErrorBoundary`)
Located at `src/desktop/components/AppErrorBoundary.tsx`.
- Per-window error boundary wrapping every application component in `WindowFrame.tsx`.
- Catches unhandled lifecycle and render errors, logs structured diagnostics to `systemLogger.error('app', ...)`, and renders a recovery panel with "Restart Application", "Close Window", and collapsible stack trace inspection without crashing the desktop compositor.

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

### ⚠️ Invariant 11: Binary-Safe Byte Operations for Hashes and Packages
- Always use `vfs.readBytes()` (not `vfs.readFile()`) when calculating cryptographic hashes (`sha256sum`, `md5sum`, `base64`) or packaging archives (`aetherpkg build`). Text decoding decodes arbitrary byte sequences as UTF-8, destroying binary payloads (such as PNG/JPEG images or precompiled WASM binaries).

### ⚠️ Invariant 12: Python Sandbox Isolation & MEMFS Synchronization
- In `pythonWorkerSource.ts`, Pyodide runs inside a WebWorker with all ambient host network, storage, and worker capabilities stripped.
- Filesystem synchronization between `AetherFS` and Pyodide MEMFS must strictly use `PythonFileBridge` without leaking host browser global scope or executing unsanitized code in the main thread.

### ⚠️ Invariant 13: Local Git POSIX File System Invariants
- `GitFileSystemAdapter` must implement all 10 filesystem command callbacks expected by isomorphic-git (`readFile`, `writeFile`, `mkdir`, `rmdir`, `unlink`, `stat`, `lstat`, `readdir`, `readlink`, `symlink`).
- Never perform Git operations directly on host disk; all repositories reside in `AetherFS 2.0` under `/home/aether/` or project roots.

### ⚠️ Invariant 14: React Pure Render & Ref Safety
- Never assign to React refs (e.g. `openWindowRef.current = openWindow`) directly during component render body. Always assign inside `useEffect` to ensure React Compiler and concurrent mode safety.

### ⚠️ Invariant 15: Centralized System Dialogs — Zero Native Browser Modals
- Never invoke native browser `alert()`, `confirm()`, or `prompt()` modal dialogs in applications or desktop components.
- Always use the centralized `dialogService` from `src/core/dialog.ts` (`dialogService.alert`, `dialogService.confirm`, `dialogService.prompt`), which provides keyboard trapping, focus preservation, validation, and theme awareness.

### ⚠️ Invariant 16: Window Title Updates & Callback Memoization
- Always memoize `onClose` and `setTitle` callbacks passed into window application components (`WindowFrame.tsx`, `AppHost.tsx`).
- In `context.tsx`, `updateWindowTitle` must guard against identical title assignments (`if (target.title === title) return prev;`) to prevent triggering runaway React state re-render cascades.

### ⚠️ Invariant 17: Pointer Capture Masking for Framed Applications
- When dragging or resizing windows or displaying modals across embedded `<iframe>` views (`AppHost`, `CodeStudioApp`, `WebBrowserApp`), render an active pointer overlay mask (`fixed inset-0 z-[99999] cursor-move select-none`) to prevent embedded iframe documents from swallowing mouse events.

### ⚠️ Invariant 18: Elevated System Context for Package Staging
- The package installer (`packageInstaller.ts`) and system daemons operate with root privileges when staging application files into `/opt/aether/apps`. Always pass `{ context: { user: 'root', uid: 0 } }` to `vfs.mkdir` and `vfs.writeBytes` so that POSIX virtual permission checks allow system-level installation into root-owned paths.

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
