# AetherOS | Advanced Browser-Based Operating System

<div align="center">

```text
       _         _   _                ___  ____  
      / \   ___ | |_| |__   ___ _ __ / _ \/ ___| 
     / _ \ / _ \| __| '_ \ / _ \ '__| | | \___ \ 
    / ___ \  __/| |_| | | |  __/ |  | |_| |___) |
   /_/   \_\___| \__|_| |_|\___|_|   \___/|____/ 
```

**A high-fidelity, Linux-inspired virtual operating environment engineered natively for modern web standards.**

[![AetherOS Version](https://img.shields.io/badge/AetherOS-v1.2.0%20Real%20Computing-00f2fe?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/BocchiTheTank131/AetherOS)
[![React](https://img.shields.io/badge/React-19.3-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.3-38bdf8?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646cff?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/Tests-83%20Passed-34d399?style=for-the-badge&logo=vitest&logoColor=black)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-amber?style=for-the-badge)](LICENSE)

[Architecture](#-architectural-overview) • [What's New in v1.2.0](#-whats-new-in-v120-real-computing) • [Subsystems](#-subsystem-deep-dive) • [Applications](#-native-application-suite) • [Shell CLI](#-shell-command-reference-50-utilities) • [Quickstart](#-getting-started) • [Contributing](#-developer-guides)

</div>

---

## 🌟 Executive Summary

Rather than emulating hardware CPU instructions through slow x86 or ARM virtualization, **AetherOS** implements genuine operating system paradigms directly on modern web standards:

- **Preemptive Virtual Kernel (`AetherCore`)**: PID process allocation starting at PID 100, POSIX signal handlers (`SIGTERM`, `SIGKILL`, `SIGSTOP`, `SIGCONT`), and measured resource telemetry based on active execution and browser JS heap limits.
- **POSIX-Compliant Filesystem (`AetherFS 2.0`)**: Complete Linux directory tree (`/bin`, `/etc`, `/home/aether`, `/proc`, `/dev`, `/var`) persisted in browser **IndexedDB v2** with binary-safe byte arrays (`Uint8Array`), POSIX virtual access control (`r/w/x`), relative symlinks, and SHA-256 verified backup and restore.
- **Secure Aether Runtime**: Isolated Web Worker execution sandbox for running untrusted user JavaScript, featuring process tracking, console streaming, timeout enforcement (exit code 124), cancellation, and a guest `aether.fs` VFS bridge.
- **Authentic Command Shell (`aesh`)**: Lexer tokenizer, full POSIX scripting AST (`if/then/elif/else/fi`, `for/do/done`, `while`, `case/esac`, functions, positional parameters `$0..$9`, `$#`, `$@`), pipelines (`|`), input/output redirections (`>`, `>>`, `<`, `2>`), conditionals (`&&`, `||`, `;`), job control (`&`, `jobs`, `fg`, `bg`, `wait`), and 50+ built-in utilities.
- **Composited Desktop Environment (`AetherWM`)**: Draggable windows with 8-direction resizing, visual snap guides, memory of window coordinates, 4 virtual workspaces, customizable dock (bottom/top/left), app launcher, command palette, and notification drawer.
- **Native Applications & Packages**: Full-featured IDE with live sandbox preview and runtime execution, file manager with host file export, terminal emulator, audio synthesizer, games, and package manager (`aetherpkg`).

---

## 🚀 What's New in v1.2.0: Real Computing

AetherOS v1.2.0 transforms AetherOS from a simulation into a capable, reliable, and authentic web-native computing environment:

- 🛡️ **Secure Aether Runtime**:
  - Sandboxed execution via dedicated Web Workers with locked-down ambient capabilities (`fetch`, `importScripts`, `indexedDB` restricted).
  - Virtual Kernel PID allocation and process table tracking for every runtime task.
  - Streaming stdout and stderr output capturing console logs and error stacks.
  - Hard execution timeouts (exit code 124) and interactive cancellation (Ctrl+C).
  - Guest `globalThis.aether.fs` bridge enabling user scripts to read, write, and inspect virtual files.
- 💾 **AetherFS 2.0**:
  - Native binary safety: storage of binary files using `Uint8Array` byte buffers with exact byte sizing.
  - POSIX Virtual Access Control: permission bitmask checks (`checkAccess`, `chmod`, `chown`, directory traversal execute bit validation).
  - Symbolic Link enhancements: distinction between link nodes and targets via `lstat`, with support for relative symlinks.
  - Versioned Backups & Restores: full filesystem backup export and restoration with SHA-256 integrity checksum verification.
  - Transactional durability: IndexedDB schema v2 with batch persistence and safe queueing.
- 📜 **Advanced aesh POSIX Scripting & Job Control**:
  - Scripting AST parser & executor supporting `if/then/elif/else/fi`, `for ... in ...; do ... done`, `while`, and `case ... in ... esac`.
  - User-defined shell functions with positional parameter binding (`$0`, `$1..$9`, `$#`, `$@`, `$*`, `$$`, `$?`).
  - Conditional evaluation builtins: `test` and `[` with support for `-f`, `-d`, `-e`, `-s`, `-z`, `-n`, `=`, `!=`, `-eq`, `-lt`, etc.
  - Job control: run background tasks with `&`, list background jobs with `jobs`, resume or bring to foreground with `fg` and `bg`, and synchronize with `wait`.
  - Executable shell scripts (`.sh`) and shebang handling (`#!/bin/aesh`, `#!/bin/node`, `#!/bin/js`).
- 📊 **Honest System Telemetry**:
  - Transparent network probing: replaced fabricated ICMP packets with honest HTTP reachability diagnostics in `ping`.
  - Transparent memory reporting: `free`, `SystemMonitorApp`, and `virtualKernel` clearly identify whether metrics originate from host browser JS heap limits or virtual allocations.
  - Measured virtual CPU activity: eliminated arbitrary randomizers in favor of state-driven execution accounting.
- 💻 **Code Studio & Terminal Integration**:
  - "Run in Runtime" button in Code Studio executes scripts directly in the isolated sandbox with live streaming log panels.
  - `js` and `node` shell built-ins execute JavaScript files or one-liners via the secure runtime.

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
- **Virtual Process Table**: Full PID allocation starting at PID 100 for user processes, preserving system kernel space:
  - `PID 1`: `/sbin/init` (`systemd`, state: `running`)
  - `PID 2`: `[kthreadd]` (kernel thread daemon, state: `running`)
  - `PID 3`: `/usr/bin/aether-desktop` (compositor process, state: `running`)
- **Process Lifecycle States**: `created`, `running`, `waiting`, `suspended`, `stopped`, `terminated`, `crashed`.
- **POSIX Signal Dispatching**:
  - `SIGINT` (Ctrl+C, exit code 130)
  - `SIGTERM` (15, graceful termination, exit code 143)
  - `SIGKILL` (9, uncatchable immediate termination, exit code 137)
  - `SIGSTOP` (19, transitions process state to `stopped`)
  - `SIGCONT` (18, resumes process state back to `running`)
- **Resource Accounting & Performance Service (`performanceService`)**: Centralized telemetry provider tracking live host memory (`performance.memory` where supported), aggregate virtual kernel footprint, real CPU utilization, active Web Worker instances, and sliding 60-sample historical buffers. Timers pause automatically when idle to eliminate CPU overhead.
- **Typed System Event Bus (`systemEventBus`)**: Pub/Sub bus handling OS-wide events (`process:started`, `process:terminated`, `filesystem:changed`, `package:installed`, `theme:changed`, `window:opened`, etc.).
- **Structured System Logger (`systemLogger`)**: 1,000-entry in-memory circular ring buffer capturing `debug`, `info`, `warn`, and `error` events with timestamps and subsystem tags. Powers `dmesg`, `journalctl`, and the GUI Log Viewer.

### 2. Virtual Filesystem (VFS & IndexedDB Persistence)
- **Full POSIX Directory Tree**: Standard Linux hierarchy (`/bin`, `/boot`, `/dev`, `/etc`, `/home/aether`, `/lib`, `/media`, `/mnt`, `/opt`, `/proc`, `/root`, `/run`, `/sbin`, `/srv`, `/sys`, `/tmp`, `/usr`, `/var`).
- **IndexedDB Batch Storage (`idbStorage`)**: In-memory nodes with write-behind queues for asynchronous IndexedDB synchronization, ensuring smooth UI performance during heavy I/O operations.
- **Dynamic Synthetic Nodes**:
  - `/proc/version`: Kernel build version (`Linux version 6.8.0-aether ...`).
  - `/proc/uptime`: Real-time system uptime and idle time in seconds.
  - `/proc/meminfo`: Live virtual memory statistics (`MemTotal`, `MemFree`, `Buffers`, `Cached`).
  - `/proc/cpuinfo`: Hardware concurrency thread count and host-aligned CPU specifications.
  - `/proc/<pid>/status`: Per-process state, PID, PPID, virtual memory RSS, and thread count generated on-demand directly from the kernel process table.
  - `/proc/<pid>/cmdline`: Null-separated command line invocation string for active processes.
  - Dynamic `/proc` directory enumeration dynamically lists active process PIDs as subdirectories.
  - `/dev/null`: Discards all written data; returns EOF immediately on read.
  - `/dev/zero`: Generates continuous zero streams on demand.
  - `/dev/random` & `/dev/urandom`: Cryptographically secure pseudorandom byte streams via Web Crypto `crypto.getRandomValues()`.
- **Node Metadata & Permissions**: Octal permissions (`0755`, `0644`, `0777`), owner (`root`, `aether`), group, creation/modification timestamps, and file size tracking.
- **Reactive Watchers (`vfs.watch`)**: Subscribes UI components and desktop views to directory changes with automatic updates.
- **Snapshots & Backups**: Complete filesystem export to downloadable JSON snapshots and one-click atomic restore.

### 3. aesh (Aether Shell & Terminal Runtime)
- **Lexer Tokenizer**: Tokenizes commands, preserving single (`'...'`) and double quotes (`"..."`) with whitespace and backslash escapes (`\n`, `\t`, `\ `, `\"`).
- **Recursive Descent AST Parser**: Generates syntax trees distinguishing simple commands, arguments, pipeline chains, conditional operators, and redirection targets.
- **Pipelining & Redirection**:
  - Pipeline chains: `cat dataset.csv | grep Engineer | wc -l`
  - Output redirection: `cmd > file.txt` (overwrite) and `cmd >> file.txt` (append)
  - Error redirection: `cmd 2> error.log`
  - Input redirection: `cmd < input.txt`
  - Conditionals: Short-circuit `&&` (AND), `||` (OR), and sequential `;` (SEMI)
- **Expansion & Path Globbing**: Expands `$HOME`, `$USER`, `$PWD`, `$SHELL`, `$?` (last exit status), `$PID`, environment variables (`${VAR}`), and wildcards (`*.txt`, `file?.log`).
- **History & Aliases**: Persistent history (`~/.aesh_history`), `history` builtin, and runtime alias substitution (`alias ll="ls -lah"`).

### 4. AetherWM & Desktop Compositor
- **Window Management Engine**:
  - 8-direction resizing (`n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`) with minWidth/minHeight constraints.
  - Titlebar dragging with edge snap detection and translucent preview box.
  - Dragging a maximized titlebar smoothly restores and centers the window under the cursor.
  - Viewport boundary clamping on window resize prevents windows from escaping screen bounds.
  - Dynamic Z-index elevation and automatic refocusing to topmost window on close.
- **4 Virtual Workspaces**: Fully isolated virtual desktops (1 to 4) with independent window assignment and instant switching.
- **Dock / Taskbar**:
  - Configurable dock positions (`bottom`, `top`, `left`).
  - Running application indicators, workspace switcher, and tray clock with quick settings popover.
- **Desktop Grid**:
  - Free dragging with 84px $\times$ 96px grid snapping.
  - Persistent icon positioning saved to `/home/aether/.config/aetheros/desktop_positions.json`.
  - Right-click contextual actions: Open, Rename, Move to Trash, and Properties modal.

### 5. AudioService (Procedural Sound Synthesizer)
AetherOS synthesizes acoustic desktop sounds natively via the **Web Audio API** without external audio file dependencies:
- **Boot Chime**: Harmonious 4-note chord progression (`F4`, `A4`, `C5`, `F5`) with sine oscillators and exponential gain ramps.
- **Notification Tone**: Dual-pitch chime (`D5`, `A5`).
- **Window Snap**: Frequency sweep (`320Hz` to `540Hz`).
- **Button Click**: Short high-frequency tick (`800Hz`).
- **Error Tone**: Sawtooth dissonance drop (`180Hz` to `140Hz`).

### 6. aetherpkg (Package Management Subsystem)
- **Manifest Architecture**: Schema specifying package ID, name, version, category, size in KB, permissions, and executable metadata.
- **Permission Sandbox**: Explicit permissions (`storage:read`, `storage:write`, `network:fetch`, `media:microphone`).
- **Registry Persistence**: Installed packages and lock states persist in `/var/lib/aetherpkg/installed.json`.
- **Dual Interfaces**: Operable via graphical **Software Center** or command-line `aetherpkg` tool.

---

## 💻 Native Application Suite

AetherOS includes **19 desktop applications** spanning 7 categories:

### Core Preinstalled Applications (14)

| Icon | Application | App ID | Executable | Description |
|:---:|:---|:---|:---|:---|
| 💻 | **Terminal** | `terminal` | `/bin/aesh` | Multi-tab aesh command shell with ANSI colors, path autocompletion, and persistent history. |
| 📁 | **Files** | `file-manager` | `/usr/bin/aether-fm` | Graphical file explorer with breadcrumbs, bookmarks, multi-field sorting, search, and host file export. |
| 📝 | **Text Editor** | `text-editor` | `/usr/bin/gedit` | Multi-tab editor with line numbers, syntax wrap, find/replace, and direct VFS saving. |
| 🛠 | **Code Studio** | `code-studio` | `/usr/bin/code` | Multi-file IDE with project tree, code editor, live `<iframe>` sandbox preview, and build console. |
| 🌐 | **Web Browser** | `web-browser` | `/usr/bin/browser` | Sandboxed browser with tabs, bookmarks, navigation controls, and URL search bar. |
| ⚙️ | **Settings** | `settings` | `/usr/bin/settings` | Appearance (dark/light, accents, wallpapers), dock position, sound effects, user accounts, and JSON backups. |
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

### Scripting & Job Control
- `jobs` — List active background jobs and their command lines.
- `fg [job_id]` — Bring a background job to the foreground.
- `bg [job_id]` — Resume a stopped or background job in the background.
- `wait [pid]` — Wait for specified background process or all background jobs to finish.
- `source <file>` / `. <file>` — Execute shell commands from a script file in the current shell environment.
- `test <expr>` / `[ <expr> ]` — Evaluate conditional expressions (`-f`, `-d`, `-e`, `-s`, `-z`, `-n`, `=`, `!=`, `-eq`, `-ne`, `-lt`, `-gt`).

### Text & Environment Builtins
- `echo [-n] [-e] [text...]` — Display a line of text with optional escape interpretation.
- `printf <format> [args...]` — Format and print text according to format specifiers.
- `clear` — Clear the terminal viewport (or `Ctrl+L`).
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
- `seq [first [step]] <last>` — Print a numeric sequence.
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

## 🗄 Preloaded Filesystem Skeleton

When booting AetherOS, a full virtual filesystem structure is synthesized and persisted:

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
│       ├── .aesh_history      # Shell history persistence across reloads
│       ├── .aeshrc            # Shell configuration, aliases (ll, la, update), prompt PS1
│       ├── .config/           # Application user configurations (aetheros, aesh)
│       │   └── aetheros/
│       │       └── desktop_positions.json # Persisted desktop icon coordinates
│       ├── .trash/            # System recycle bin (with restore support)
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
│       │   ├── real-computing/# AetherOS v1.2.0 starter project
│       │   │   └── hello.js   # Script using aether.fs sandbox API
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
| `Alt + F4` | **Close Window** | Close the currently focused window (refocuses topmost window). |
| `Super + T` or `Ctrl + Alt + T` | **Launch Terminal** | Open a new instance of the `aesh` Terminal. |
| `Super + E` | **Launch Files** | Open the Graphical File Manager. |
| `Super + Left Arrow` | **Snap Window Left** | Snap active window to left 50% of the screen. |
| `Super + Right Arrow` | **Snap Window Right** | Snap active window to right 50% of the screen. |
| `Super + Up Arrow` | **Maximize Window** | Expand active window to occupy the entire workspace. |
| `Super + Down Arrow` | **Restore / Minimize** | Restore maximized window or minimize to dock. |
| `Ctrl + L` *(in Terminal)* | **Clear Screen** | Instantly clear active terminal tab history. |
| `Ctrl + C` *(in Terminal)* | **Interrupt (SIGINT)** | Cancel active command input line. |
| `Escape` | **Dismiss Overlays** | Close Start Menu, Command Palette, or active modal dialogs. |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or later (tested on Node v20 and v24)
- **npm**, **pnpm**, or **yarn**

### 1. Installation
```bash
# Clone repository
git clone https://github.com/your-username/AetherOS.git
cd AetherOS

# Install dependencies
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
Navigate to `http://localhost:5173/`. AetherOS will execute its Linux systemd boot splash sequence and load the desktop environment.

### 3. Run Automated Tests
```bash
# Run Vitest test suite (34 unit & integration tests)
npm test
```

### 4. Code Quality & Linting
```bash
# Run oxlint across all source files
npm run lint
```

### 5. Production Build & Preview
```bash
# Compile optimized production bundle
npm run build

# Preview build locally
npm run preview
```

---

## 🛠 Developer Guides

### How to Create a New Native Application

1. **Create the React Component** in `src/apps/myApp/MyApp.tsx`:
   ```tsx
   import React from 'react';
   import type { AppProps } from '../types';

   export const MyApp: React.FC<AppProps> = ({ windowId, setTitle }) => {
     return (
       <div className="flex flex-col h-full bg-[#111827] text-white p-4">
         <h1 className="text-xl font-bold">My New Application</h1>
         <p className="text-gray-400 mt-2">Running natively inside AetherOS!</p>
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
   Add the icon to `getAppIcon` inside `src/desktop/components/WindowFrame.tsx` and `src/desktop/components/AppLauncher.tsx`.

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
2. Test installation via Terminal: `aetherpkg install my-package` or through the **Software Center**.

---

### How to Add a New Shell Command to `aesh`

1. **Define Command in `src/shell/commands/`** (e.g. `textCommands.ts`):
   ```ts
   import type { RegisteredCommand, ExecutionResult } from '../types';

   export const myCommand: RegisteredCommand = {
     name: 'greet',
     description: 'Print a personalized welcome greeting',
     usage: 'greet <name>',
     manual: 'greet - Prints a welcome message to standard output.',
     execute: (args, context): ExecutionResult => {
       if (args.length === 0) {
         return { stdout: '', stderr: 'greet: missing operand\n', exitCode: 1 };
       }
       return { stdout: `Hello, ${args[0]}! Welcome to AetherOS.\n`, stderr: '', exitCode: 0 };
     },
   };
   ```
2. The command is automatically discovered upon shell initialization. Test in Terminal: `greet Aether`.

---

## 🔒 Security Model & Honest Execution Boundaries

AetherOS adheres strictly to an **honest execution model** respecting browser sandbox boundaries:
- **Client-Side Sandbox**: Operates entirely within the browser. It never falsely claims or simulates host operating system compromise.
- **Iframe Isolation**: When code executes in **Code Studio** or renders in **Web Browser**, previews run inside isolated `<iframe>` sandboxes (`sandbox="allow-scripts"`) preventing guest code from mutating host or parent OS state.
- **Network Boundaries**: `curl`, `wget`, and `ping` perform real HTTP requests via browser `fetch`. Network queries respect browser CORS boundaries; `ping` measures real round-trip latency to remote servers.
- **Persistent Storage Isolation**: Files, configurations, and packages are confined to origin-isolated browser IndexedDB stores (`aetheros-vfs-db`), ensuring data privacy and persistence.

---

## 📚 Audit & Architecture Documentation

- [AGENTS.md](AGENTS.md) — Developer & AI agent handbook detailing coding invariants, subsystem contracts, and contribution workflows.
- [CODE_REVIEW_REPORT.md](CODE_REVIEW_REPORT.md) — Thorough audit analyzing 44 identified items across 5 priority tiers with root cause analyses.

---

## 📄 License

This project is open-source software licensed under the **[MIT License](LICENSE)**.
