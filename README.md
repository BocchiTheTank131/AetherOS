# AetherOS | Advanced Browser-Based Operating System

![AetherOS](https://img.shields.io/badge/AetherOS-1.0%20LTS-00f2fe?style=for-the-badge&logo=linux&logoColor=white)
![React](https://img.shields.io/badge/React-19.3-61dafb?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.3-38bdf8?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.3-646cff?style=for-the-badge&logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-5.0-fcc72b?style=for-the-badge&logo=vitest&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**AetherOS** is a high-fidelity, Linux-inspired virtual operating environment engineered natively for modern web browsers. Rather than emulating hardware CPU instructions through slow x86 or ARM virtualization, AetherOS implements genuine operating system abstractions directly on web standards: a preemptive process table (`AetherCore`), a POSIX-compliant virtual filesystem with IndexedDB persistence (`VFS`), an authentic command shell with AST parsing and pipelines (`aesh`), a composited multi-window desktop with 4 virtual workspaces (`AetherWM`), and an expandable ecosystem of 19 native applications and packages.

---

## 📑 Table of Contents

1. [Architectural Overview](#-architectural-overview)
2. [Subsystem Deep Dive](#-subsystem-deep-dive)
   - [AetherCore (Virtual Kernel & Process Management)](#1-aethercore-virtual-kernel--process-management)
   - [Virtual Filesystem (VFS & IndexedDB Persistence)](#2-virtual-filesystem-vfs--indexeddb-persistence)
   - [aesh (Aether Shell & Terminal Runtime)](#3-aesh-aether-shell--terminal-runtime)
   - [AetherWM & Desktop Compositor](#4-aetherwm--desktop-compositor)
   - [AudioService (Procedural Web Audio Synthesizer)](#5-audioservice-procedural-sound-synthesizer)
   - [aetherpkg (Package Management Subsystem)](#6-aetherpkg-package-management-subsystem)
3. [Native Application Suite](#-native-application-suite)
   - [Core Preinstalled Applications](#core-preinstalled-applications-14)
   - [Installable Packages](#installable-packages-5)
4. [Shell Command Reference (45+ Utilities)](#-shell-command-reference-45-utilities)
5. [Preloaded Filesystem Skeleton & Assets](#-preloaded-filesystem-skeleton--assets)
6. [Global Keyboard Shortcuts](#-global-keyboard-shortcuts)
7. [Getting Started & Development](#-getting-started--development)
8. [Developer How-To Guides](#-developer-how-to-guides)
   - [Creating a New Native Application](#how-to-create-a-new-native-application)
   - [Adding an Installable Package to aetherpkg](#how-to-add-an-installable-package-to-aetherpkg)
   - [Adding a New Built-in Shell Command](#how-to-add-a-new-shell-command-to-aesh)
9. [Security Model & Honest Execution Boundaries](#-security-model--honest-execution-boundaries)
10. [Audit & Architecture Documentation](#-audit--architecture-documentation)
11. [License](#-license)

---

## 🏛 Architectural Overview

```text
+---------------------------------------------------------------------------------------+
|                                    Aether Desktop UI                                   |
|  +--------------------+  +--------------------+  +------------------+  +-----------+  |
|  | Window Compositor  |  |  Taskbar & Dock    |  |  App Launcher    |  |  Palette  |  |
|  | (8-dir, snap, WS)  |  |  (Top/Bottom/Left) |  |  (Categorized)   |  | (Alt+Spc) |  |
|  +--------------------+  +--------------------+  +------------------+  +-----------+  |
+---------------------------------------------------------------------------------------+
|                                Application Platform (19 Apps)                         |
|  Terminal · Files · Code Studio · Browser · Settings · System Monitor · Software · ... |
+---------------------------------------------------------------------------------------+
|                            aesh Shell Runtime & Command Engine                         |
|   Lexer -> AST Parser -> Execution Pipeline (| > >> < 2> && || ;) -> 45+ Builtins    |
+---------------------------------------------------------------------------------------+
|                               AetherCore Virtual Kernel                               |
|   PID Table (1..N) · Signal Dispatcher · Metrics Jitter · Event Bus · Ring Logger     |
+---------------------------------------------------------------------------------------+
|                               Virtual Filesystem (VFS)                                |
|   POSIX Hierarchy · Dynamic /proc & /dev · Permissions · Watchers · JSON Backup       |
+---------------------------------------------------------------------------------------+
|                                Browser Standards Layer                                |
|     IndexedDB (Storage) · Web Audio API · Web Crypto API · Canvas 2D · Fetch API      |
+---------------------------------------------------------------------------------------+
```

---

## 🔬 Subsystem Deep Dive

### 1. AetherCore (Virtual Kernel & Process Management)
- **Virtual Process Table**: Full PID allocation starting at PID 100 for user processes, with preserved kernel space:
  - `PID 1`: `/sbin/init` (`systemd`, state: `running`)
  - `PID 2`: `[kthreadd]` (kernel thread daemon, state: `running`)
  - `PID 3`: `/usr/bin/aether-desktop` (compositor process, state: `running`)
- **Process Lifecycle States**: `created`, `running`, `waiting`, `suspended`, `stopped`, `terminated`, `crashed`.
- **Signal Dispatching**: Authentic handling of standard POSIX signals:
  - `SIGINT` (Ctrl+C, exit code 130)
  - `SIGTERM` (15, graceful termination, exit code 143)
  - `SIGKILL` (9, uncatchable immediate termination, exit code 137)
  - `SIGSTOP` (19, transitions process state to `stopped`)
  - `SIGCONT` (18, resumes process state back to `running`)
- **Process Resource Accounting**: Active background sampler (3-second cadence) generating realistic CPU utilization jitter and memory RSS footprint dynamically tracked per process.
- **Typed System Event Bus (`systemEventBus`)**: Decoupled pub/sub communication across all subsystems (`process:started`, `process:terminated`, `filesystem:changed`, `package:installed`, `theme:changed`, `window:opened`, `window:focused`, etc.).
- **Structured System Logger (`systemLogger`)**: 1,000-entry in-memory circular ring buffer capturing `debug`, `info`, `warn`, and `error` events with timestamps, subsystem tags, and structured metadata. Powers `dmesg`, `journalctl`, and the GUI Log Viewer.

### 2. Virtual Filesystem (VFS & IndexedDB Persistence)
- **Full POSIX Directory Tree**: Standard FHS compliance (`/bin`, `/boot`, `/dev`, `/etc`, `/home/aether`, `/lib`, `/media`, `/mnt`, `/opt`, `/proc`, `/root`, `/run`, `/sbin`, `/srv`, `/sys`, `/tmp`, `/usr`, `/var`).
- **IndexedDB Batch Persistence (`idbStorage`)**: Filesystem nodes are kept in high-performance memory maps and persisted asynchronously via IndexedDB write-behind queues, eliminating UI stutter during heavy I/O.
- **Dynamic Synthetic Nodes**:
  - `/proc/version`: Kernel build string (`Linux version 6.8.0-aether ...`).
  - `/proc/uptime`: Real-time system uptime and idle time in seconds.
  - `/proc/meminfo`: Live memory usage (`MemTotal`, `MemFree`, `Buffers`, `Cached`).
  - `/proc/cpuinfo`: Hardware concurrency thread count and simulated CPU specifications.
  - `/dev/null`: Discards all written data; returns EOF immediately on read.
  - `/dev/zero`: Generates continuous zero streams on demand.
  - `/dev/random` & `/dev/urandom`: Cryptographically secure pseudorandom byte streams using Web Crypto `crypto.getRandomValues()`.
- **Node Metadata & Permissions**: Octal permissions (`0755`, `0644`, `0777`), owner (`root`, `aether`), group, creation/modification timestamps, and file size tracking.
- **Reactive Watchers (`vfs.watch`)**: Allows UI components and desktop surfaces to subscribe to directory modifications and auto-refresh when files change.
- **Trash Bin Integration**: Dedicated trash directory at `/home/aether/.trash` with safe file deletion, restoration, and permanent purge capabilities.
- **Snapshots & Backups**: Full system snapshot export to downloadable JSON files, and atomic restore with session reload.

### 3. aesh (Aether Shell & Terminal Runtime)
- **Architecture**:
  - **Lexer**: Tokenizes command lines, correctly preserving quoted strings with embedded whitespace (`"..."`, `'...'`) and backslash escapes (`\n`, `\t`, `\ `, `\"`).
  - **Recursive Descent AST Parser**: Generates structured Abstract Syntax Trees distinguishing commands, arguments, pipeline chains, conditional operators, and I/O redirection targets.
- **Execution Engine**:
  - **Pipelines**: Arbitrary chained commands (`cat data.csv | grep Engineer | wc -l`).
  - **Output Redirection**: Write to file (`cmd > out.txt`) and append (`cmd >> out.txt`).
  - **Error Redirection**: Standard error redirection (`cmd 2> err.log`).
  - **Input Redirection**: Stream file content into stdin (`cmd < input.txt`).
  - **Logical Operators**: Short-circuit `&&` (AND), `||` (OR), and sequential `;` (SEMI).
  - **Variable Expansion**: Expands `$HOME`, `$USER`, `$PWD`, `$SHELL`, `$?` (last exit code), `$PID`, and custom environment variables (`${VAR}`).
  - **Path Globbing**: Wildcard expansion (`*.txt`, `file?.log`) evaluated against the VFS.
  - **History & Aliases**: In-memory shell history (`history`, `history -c`) and runtime alias substitution (`alias ll="ls -lah"`).

### 4. AetherWM & Desktop Compositor
- **Window Management Engine**:
  - Full 8-direction resizing handles (`n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`).
  - Dragging with viewport edge clamping.
  - Window edge snapping (Left 50%, Right 50%, Maximize fullscreen).
  - Minimize, restore, and dynamic Z-index stacking with active window elevation.
  - Window constraints enforcement (`minWidth`, `minHeight`, `defaultWidth`, `defaultHeight`).
- **4 Virtual Workspaces**: Fully isolated virtual desktop workspaces (1 to 4) with independent window assignment and swift switching.
- **Dock / Taskbar**:
  - Configurable dock positions (`bottom`, `top`, `left`).
  - Running application indicator dots and active window task buttons.
  - Workspace switcher buttons.
  - System tray featuring real-time digital clock, quick settings toggles, and notification badge.
- **Desktop Canvas**:
  - Live folder binding: automatically mirrors `/home/aether/Desktop` files as desktop icons via reactive VFS watchers.
  - Drag selection marquee.
  - Right-click desktop context menu (create folder, create file, open terminal, change wallpaper, system settings).
  - Wallpaper engine supporting custom wallpaper URLs and gallery presets.
- **App Launcher (Start Menu)**:
  - Categorized catalog (Accessories, Development, Games, Internet, Media, System, Utilities).
  - Instant live filter search.
  - User identity badge and session power controls.
- **Command Palette / Quick Runner (`Alt + Space`)**:
  - System-wide fuzzy search across applications, filesystem files, and shell commands.
  - Direct execution with keyboard navigation (`Up`, `Down`, `Enter`, `Escape`).
- **Notification Center & Quick Settings**:
  - Toast alerts with severity color coding (`info`, `success`, `warning`, `error`).
  - Slide-out notification history panel.
  - Quick settings popover with interactive master volume slider, Dark/Light mode toggle, and power actions.

### 5. AudioService (Procedural Sound Synthesizer)
AetherOS does not rely on external MP3/WAV assets for desktop sound effects. Instead, it utilizes the native **Web Audio API** to procedurally synthesize rich acoustic tones:
- **Boot Chime**: Harmonious 4-note chord progression (`F4`, `A4`, `C5`, `F5`) generated with sine oscillators and exponential gain envelopes.
- **Notification Tone**: Dual-pitch triangle chime (`D5`, `A5`).
- **Window Snap**: Sine sweep with exponential frequency ramp (`320Hz` to `540Hz`).
- **Button Click**: Short high-frequency sine tick (`800Hz`).
- **System Error Tone**: Sawtooth dissonance drop (`180Hz` to `140Hz`).

### 6. aetherpkg (Package Management Subsystem)
- **Manifest Architecture (`AetherPackage`)**: Standardized schema defining package ID, name, version, category, size in KB, required permissions, and executable metadata.
- **Permission Boundary**: Sandboxed permission declarations (`storage:read`, `storage:write`, `network:fetch`, `media:microphone`).
- **Registry Persistence**: Installed packages and lock states persist in `/var/lib/aetherpkg/installed.json` inside the VFS.
- **Dual Interfaces**: Operable both through the graphical **Software Center** and the terminal CLI command (`aetherpkg`).

---

## 💻 Native Application Suite

AetherOS includes 19 desktop applications spanning 7 categories:

### Core Preinstalled Applications (14)

| Icon | Application | App ID | Executable | Description |
|:---:|:---|:---|:---|:---|
| 💻 | **Terminal** | `terminal` | `/bin/aesh` | Multi-tab aesh command shell with ANSI colors, history navigation, and tab completion. |
| 📁 | **Files** | `file-manager` | `/usr/bin/aether-fm` | Graphical file explorer with breadcrumbs, bookmarks, search, list/grid views, and host file upload. |
| 📝 | **Text Editor** | `text-editor` | `/usr/bin/gedit` | Multi-tab editor with line numbers, syntax wrap, find/replace, and direct VFS saving. |
| 🛠 | **Code Studio** | `code-studio` | `/usr/bin/code` | Multi-file IDE with project tree, code editor, live `<iframe>` sandbox preview, and build console. |
| 🌐 | **Web Browser** | `web-browser` | `/usr/bin/browser` | Sandboxed browser with tabs, bookmarks, navigation controls, and URL search bar. |
| ⚙️ | **Settings** | `settings` | `/usr/bin/settings` | Appearance (dark/light, accents, wallpapers), dock position, user accounts, and JSON backups. |
| 📊 | **System Monitor** | `system-monitor` | `/usr/bin/top` | Live process manager with kill actions, real-time Canvas CPU and Memory charts, and service status. |
| 📦 | **Software Center** | `software-center` | `/usr/bin/software-center` | Graphical frontend for `aetherpkg` with 1-click install, uninstall, and search. |
| 🧮 | **Calculator** | `calculator` | `/usr/bin/calc` | Standard arithmetic and scientific calculation engine with calculation history log. |
| 🎵 | **Media Player** | `media-player` | `/usr/bin/player` | Audio/video player featuring procedural ambient soundscapes, waveforms, and file playback. |
| 🖼 | **Image Viewer** | `image-viewer` | `/usr/bin/eog` | Image inspector supporting SVG vectors, PNG, JPEG, zoom controls, and rotation. |
| 📋 | **Notes & To-Do** | `notes` | `/usr/bin/notes` | Categorized sticky notes, markdown notes, and task checklists auto-saved to VFS. |
| 📖 | **Document Viewer**| `document-viewer`| `/usr/bin/evince` | Markdown documentation reader with live rendered presentation and raw source toggle. |
| 📜 | **System Logs** | `log-viewer` | `/usr/bin/journalctl` | Graphical viewer for systemd journal and kernel ring buffer with level filtering. |

### Installable Packages (5)

| Icon | Package Name | Package ID | Version | Category | Permissions | Description |
|:---:|:---|:---|:---:|:---|:---|:---|
| 💣 | **Minesweeper Classic** | `minesweeper` | 1.2.0 | Games | `storage:read` | Classic retro puzzle game with adjustable difficulty grids and mine counter. |
| 🔢 | **2048 Puzzle** | `game2048` | 2.0.4 | Games | `storage:read` | Interactive sliding tile number puzzle with score tracking. |
| 🎨 | **Paint Studio** | `paint` | 1.5.1 | Media | `storage:read`, `storage:write` | Canvas sketching application with brushes, colors, line thickness, and PNG export. |
| 🌦 | **Meteor Weather** | `weather` | 1.1.0 | Utilities | `network:fetch` | Live Open-Meteo weather station forecasts with humidity, wind, and multi-day trends. |
| 🎙 | **Sound Studio** | `audio-recorder`| 1.0.3 | Media | `media:microphone`, `storage:write` | Microphone voice recorder saving audio clips directly to `/home/aether/Music`. |

---

## ⚡ Shell Command Reference (45+ Utilities)

### Filesystem Commands
- `ls [-l] [-a] [-h] [path]` — List directory contents with permissions, sizes, and timestamps.
- `cd [path]` — Change current working directory (`~`, `..`, `-`).
- `pwd` — Print current working directory.
- `mkdir [-p] <dir...>` — Create one or more directories.
- `rmdir <dir...>` — Remove empty directories.
- `touch <file...>` — Create empty files or update timestamps.
- `cat [-n] <file...>` — Concatenate and display file contents with optional line numbers.
- `cp [-r] <src...> <dest>` — Copy files or directories recursively.
- `mv <src...> <dest>` — Move or rename files and directories.
- `rm [-r] [-f] <path...>` — Remove files or directories recursively.
- `tree [-L depth] [path]` — Visual directory tree hierarchy.
- `find [path] [-name pattern] [-type f|d]` — Search for files and directories matching conditions.
- `stat <path>` — Display detailed inode metadata, mode, UID/GID, and timestamps.
- `file <path>` — Determine MIME type and file classification.
- `du [-h] [-s] [path]` — Estimate file and directory space usage.
- `df [-h]` — Report virtual filesystem disk space usage.
- `head [-n lines] [file]` — Output first lines of a file or stream.
- `tail [-n lines] [file]` — Output last lines of a file or stream.
- `wc [-l] [-w] [-c] [file]` — Count lines, words, and byte/character counts.
- `sort [-r] [-n] [file]` — Sort lines of text alphabetically or numerically.
- `uniq [-c] [-d] [file]` — Filter out adjacent duplicate lines.
- `grep [-i] [-v] [-n] [-c] <pattern> [file]` — Search text using regular expressions or strings.
- `chmod <octal> <path>` — Change file mode bits (`chmod 755 file.sh`).
- `chown <user[:group]> <path>` — Change file owner and group.

### System & Process Commands
- `ps [aux]` — List running virtual processes, PIDs, states, CPU%, and memory.
- `top` / `htop` — Display real-time virtual system metrics, CPU usage, and process list.
- `kill [-signal] <pid...>` — Send signal (`SIGTERM`, `SIGKILL`, `SIGSTOP`, `SIGCONT`) to process.
- `killall [-signal] <name>` — Terminate all processes matching a program name.
- `uptime [-p] [-s]` — Show how long the virtual OS has been running.
- `whoami` — Print current active username (`aether` or `root`).
- `id` — Print user UID, GID, and groups.
- `uname [-a] [-r] [-m] [-s]` — Print operating system name, release, and virtual architecture.
- `hostname` — Show system network hostname.
- `free [-h] [-m]` — Display amount of free and used virtual memory.
- `fastfetch` / `neofetch` — Display eye-catching ASCII logo and system information summary.
- `dmesg [-T]` — Dump kernel ring buffer log messages.
- `journalctl [-n] [-u]` — Inspect systemd journal logs.
- `reboot` — Gracefully restart the virtual operating system.
- `shutdown` — Power down the virtual environment.

### Text & Environment Builtins
- `echo [-n] [-e] [text...]` — Display a line of text with optional escape interpretation.
- `printf <format> [args...]` — Format and print text according to format specifiers.
- `clear` — Clear the terminal viewport.
- `history [-c]` — Display or clear the command execution history.
- `alias [name=val]` — Define or display command aliases.
- `unalias <name>` — Remove an existing alias definition.
- `export <VAR=val>` — Set environment variable in the shell session.
- `unset <VAR>` — Remove an environment variable.
- `env` / `printenv` — Print all current environment variables.
- `which <command>` — Locate executable path for a given command.
- `type <command>` — Describe how a command name would be interpreted.
- `help` — Show built-in command summary and usage syntax.
- `man <command>` — Display manual page for a command.
- `date [+format]` — Display or format current system date and time.
- `sleep <seconds>` — Pause shell execution for a specified duration.
- `seq [first] [step] <last>` — Print a sequence of numbers.
- `yes [string]` — Output a string repeatedly until terminated.
- `true` / `false` — Return 0 (success) or 1 (failure) exit status.

### Network & Data Utilities
- `ping [-c count] <host>` — Perform real HTTP round-trip latency checks to target host.
- `curl [-I] [-s] [-o file] [-X method] <url>` — Transfer data from or to a network server.
- `wget [-O file] <url>` — Download file from a remote URL to the current directory.
- `base64 [-d] [file]` — Encode or decode data using RFC 4648 Base64 specification.
- `sha256sum <file...>` — Compute SHA-256 cryptographic hashes using Web Crypto API.
- `md5sum <file...>` — Compute MD5 checksums for data integrity verification.
- `jq <filter> [file]` — Parse and slice JSON structures using jq-compatible expressions.
- `js` / `node` — Sandboxed JavaScript execution runtime.

### Package Manager (`aetherpkg`)
- `aetherpkg list` — List all official repository packages and their install status.
- `aetherpkg search <term>` — Search repository for packages matching keyword.
- `aetherpkg install <package>` — Install an application package into the system.
- `aetherpkg remove <package>` — Uninstall a package from the system.
- `aetherpkg info <package>` — Display package manifest details, version, and permissions.
- `aetherpkg update` — Sync repository indices with latest upstream metadata.

---

## 🗄 Preloaded Filesystem Skeleton & Assets

When booting AetherOS for the first time, a rich virtual filesystem structure is synthesized and persisted:

```text
/
├── bin/                       # Core system executables (aesh, sh)
├── boot/                      # Virtual bootloader and kernel images
├── dev/                       # Dynamic device nodes (/dev/null, /dev/zero, /dev/urandom)
├── etc/
│   ├── hostname               # "aetheros"
│   ├── hosts                  # Localhost loopback definitions
│   ├── os-release             # Distribution release specifications
│   └── profile                # Global environment variable initialization
├── home/
│   └── aether/                # Default user home directory
│       ├── .aeshrc            # Shell configuration, aliases (ll, la, update), prompt PS1
│       ├── .config/           # Application user configurations (aetheros, aesh)
│       ├── .trash/            # System recycle bin
│       ├── Desktop/           # Desktop folder (mirrored live onto desktop surface)
│       │   └── Welcome.txt    # Getting started overview
│       ├── Documents/
│       │   └── GettingStarted.md # Comprehensive user guide and tutorials
│       ├── Downloads/
│       │   └── sample_dataset.csv # Multi-column sample corporate dataset
│       ├── Music/             # Directory for audio clips and Sound Studio recordings
│       ├── Pictures/
│       │   └── aether_constellation.svg # Vector artwork readable by Image Viewer
│       ├── Projects/
│       │   └── web-demo/      # Starter project editable in Code Studio
│       │       ├── index.html # Interactive HTML markup
│       │       ├── style.css  # Modern CSS styling with glassmorphism
│       │       └── app.js     # JavaScript interactive counter
│       └── Videos/            # Reserved directory for media files
├── proc/                      # Dynamic virtual nodes (/proc/version, uptime, meminfo, cpuinfo)
├── tmp/                       # Ephemeral directory with 0777 permissions
├── usr/
│   ├── bin/                   # Application launcher binaries
│   ├── lib/                   # Shared system libraries
│   └── share/                 # Shared data and asset templates
└── var/
    ├── lib/
    │   └── aetherpkg/         # Package manager records (installed.json)
    └── log/                   # Persistent system logs
```

---

## ⌨️ Global Keyboard Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| `Alt + Space` or `Super + R` | **Command Palette** | Open global quick runner to search apps, files, or execute commands. |
| `Alt + Tab` | **Cycle Windows** | Switch focus sequentially between open application windows. |
| `Alt + F4` | **Close Window** | Close the currently focused window. |
| `Super + T` or `Ctrl + Alt + T` | **Launch Terminal** | Open a new instance of the `aesh` Terminal. |
| `Super + E` | **Launch Files** | Open the Graphical File Manager. |
| `Super + Left Arrow` | **Snap Window Left** | Snap active window to left 50% half of screen. |
| `Super + Right Arrow` | **Snap Window Right** | Snap active window to right 50% half of screen. |
| `Super + Up Arrow` | **Maximize Window** | Expand active window to occupy the entire workspace. |
| `Super + Down Arrow` | **Restore / Minimize** | Restore maximized window or minimize to dock. |
| `Escape` | **Dismiss Overlays** | Close Start Menu, Command Palette, or active modal dialogs. |

---

## 🚀 Getting Started & Development

### Prerequisites
- **Node.js**: v18.0.0 or later (tested on Node v20 and v24)
- **npm** or **pnpm** / **yarn**

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/AetherOS.git
cd AetherOS

# Install dependencies
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
Navigate to `http://localhost:5173/` in your browser. The system will run the Linux boot animation sequence and drop you onto the AetherOS desktop.

### 3. Run Automated Tests
```bash
# Execute Vitest test suite
npm test
```

### 4. Code Quality & Linting
```bash
# Run oxlint across all source files
npm run lint
```

### 5. Production Build & Preview
```bash
# Typecheck and compile production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## 🛠 Developer How-To Guides

### How to Create a New Native Application

1. **Create the React Component** in `src/apps/myApp/MyApp.tsx`:
   ```tsx
   import React from 'react';
   import type { AppProps } from '../types';

   export const MyApp: React.FC<AppProps> = ({ windowId, setTitle }) => {
     return (
       <div className="flex flex-col h-full bg-[#111827] text-white p-4">
         <h1 className="text-xl font-bold">My New Application</h1>
         <p className="text-gray-400 mt-2">Running inside AetherOS!</p>
       </div>
     );
   };
   ```

2. **Register the App in `src/apps/appRegistry.ts`**:
   ```ts
   import { MyApp } from './myApp/MyApp';

   // Inside registerCoreApps():
   {
     id: 'my-app',
     name: 'My Application',
     icon: 'Sparkles', // Lucide icon name
     category: 'Accessories',
     description: 'A custom native application',
     component: MyApp,
     defaultWidth: 720,
     defaultHeight: 480,
     minWidth: 400,
     minHeight: 300,
     executable: '/usr/bin/my-app',
   }
   ```

3. **Verify Icon Mapping**:
   If using a newly imported Lucide icon, ensure it is handled in `src/desktop/components/WindowFrame.tsx` and `src/desktop/components/AppLauncher.tsx`.

---

### How to Add an Installable Package to `aetherpkg`

1. **Add Package Manifest to `src/pkg/repository.ts`**:
   ```ts
   {
     id: 'my-package',
     name: 'My Custom Tool',
     version: '1.0.0',
     description: 'An installable package for AetherOS.',
     author: 'Developer',
     category: 'Utilities',
     icon: 'Package',
     sizeKb: 180,
     permissions: ['storage:read', 'storage:write'],
     installed: false,
     appId: 'my-app', // Must match an existing entry in AppRegistry
   }
   ```

2. Ensure `appId` references a valid registered application in `appRegistry.ts`.
3. Test installing via CLI: `aetherpkg install my-package` or via the **Software Center**.

---

### How to Add a New Shell Command to `aesh`

1. **Define Command in `src/shell/commands/`** (e.g., `fsCommands.ts`, `sysCommands.ts`, or `textCommands.ts`):
   ```ts
   import type { ShellCommand, ExecutionResult } from '../types';

   export const myCommand: ShellCommand = {
     name: 'greet',
     description: 'Print a personalized welcome greeting',
     usage: 'greet <name>',
     manual: 'greet - Prints a welcome message to standard output.',
     execute: (args, context, stdin): ExecutionResult => {
       if (args.length === 0) {
         return { stdout: '', stderr: 'greet: missing operand\n', exitCode: 1 };
       }
       return { stdout: `Hello, ${args[0]}! Welcome to AetherOS.\n`, stderr: '', exitCode: 0 };
     },
   };
   ```
2. The command will be automatically registered when the shell command registry initializes.
3. Test in Terminal: `greet Aether`.

---

## 🔒 Security Model & Honest Execution Boundaries

AetherOS adheres to an **honest execution model** respecting web standards and browser sandbox boundaries:
- **Client-Side Sandbox**: AetherOS operates entirely within the browser. It does not claim or simulate arbitrary native host hardware compromise.
- **Iframe Isolation**: When code is executed in **Code Studio** or rendered in **Web Browser**, previews are isolated inside `<iframe>` sandboxes (`sandbox="allow-scripts"`) ensuring framed code cannot mutate parent OS state.
- **Network Boundaries**: Commands like `curl`, `wget`, and `ping` perform real HTTP requests using the `fetch` API. Network queries are constrained by browser CORS (Cross-Origin Resource Sharing) policies; `ping` measures actual round-trip latency to reach endpoint domains.
- **Persistent Storage Isolation**: User documents, configuration keys, and packages are confined to origin-isolated browser IndexedDB stores (`aetheros-vfs-db`), keeping user data private to the origin domain.

---

## 📚 Audit & Architecture Documentation

- [AGENTS.md](file:///c:/Users/Win/Documents/AetherOS/AGENTS.md) — Comprehensive developer & AI agent handbook detailing coding invariants, subsystem contracts, and contribution workflows.
- [CODE_REVIEW_REPORT.md](file:///c:/Users/Win/Documents/AetherOS/CODE_REVIEW_REPORT.md) — Thorough audit analyzing 44 identified items across 5 priority tiers with root cause analyses.

---

## 📄 License

This project is licensed under the **MIT License**.  
See the `LICENSE` file for full terms and conditions.
