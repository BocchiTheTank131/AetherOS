# AetherOS Code Review & Comprehensive Bug Report
Generated: October 31, 2026 | Antigravity AI Review

---

## Executive Summary

A comprehensive code and architectural review was conducted on **AetherOS**, covering:
- Virtual Kernel (`AetherCore`) & System Context Provider
- Virtual Filesystem (`VFS`) & IndexedDB Persistence
- Shell Engine (`aesh`), Parser, Lexer, & Built-in Linux Commands
- Package Manager (`aetherpkg`) & Official Repository
- Desktop Environment (`AetherWM`, Taskbar, Panels, Window Compositor)
- 17 Native Built-in Applications & Game Ports
- Linter, Type System, Tests, and Build Pipelines

### Severity Matrix

| Subsystem | Critical | Moderate | Minor / Polish | Total |
|---|:---:|:---:|:---:|:---:|
| **Desktop & Window Management** | 2 | 4 | 2 | **8** |
| **Virtual Kernel & System Context** | 1 | 2 | 1 | **4** |
| **Virtual Filesystem (VFS) & Storage** | 1 | 4 | 1 | **6** |
| **Shell & Commands (aesh)** | 0 | 7 | 3 | **10** |
| **Package Management (aetherpkg)** | 2 | 0 | 1 | **3** |
| **Built-in Applications** | 3 | 6 | 4 | **13** |
| **Total** | **9** | **23** | **12** | **44** |

---

## 🚨 Category 1: Critical & High-Severity Bugs

### 1.1 Global Keyboard Input Hijacking by 2048 Game
- **File:** `src/apps/games/Game2048App.tsx` (Lines 158–177)
- **Description:** `Game2048App` attaches an unconditional global `keydown` event listener to `window` for `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, and keys `'a'`, `'d'`, `'w'`, `'s'`, immediately invoking `e.preventDefault()`.
- **Impact:** Whenever the 2048 app is open (even when running in the background or minimized), **users cannot type `a`, `w`, `s`, `d` or use arrow keys anywhere across the OS**. For example, typing `cat`, `pwd`, or `date` in the terminal fails because keystrokes are swallowed by 2048.
- **Recommended Fix:** Only handle key events when the window has active focus (`win.isFocused`), or immediately return if `e.target` is an `HTMLInputElement` or `HTMLTextAreaElement`.

```tsx
// Suggested Fix:
const handleKey = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }
  // Also verify window focus before processing
  ...
};
```

---

### 1.2 Global Keystroke Interception & Unbounded Effect in Calculator
- **File:** `src/apps/calculator/CalculatorApp.tsx` (Lines 89–104)
- **Description:** The `useEffect` that attaches the `keydown` listener to `window` has **no dependency array** (`[]` is omitted), causing it to re-bind on every single render. Furthermore, it listens globally on `window` for digits `0–9`, operators `+`, `-`, `*`, `/`, and `Enter`, `Backspace`, `Escape`.
- **Impact:** While typing in any other application (such as the terminal, text editor, or settings), the Calculator intercepts every keystroke, backspaces, and evaluates calculations in the background.
- **Recommended Fix:** Add `[]` dependency array and check if the calculator window is focused before processing key events.

---

### 1.3 System "Shut Down" Causes Immediate OS Reboot Loop
- **Files:** `src/App.tsx` (Lines 17–19), `src/core/context.tsx` (Lines 335–338)
- **Description:** Calling `shutdownSystem()` sets `booted = false`. In `App.tsx`:
  ```tsx
  if (!bootCompleted || !booted) {
    return <BootScreen onComplete={() => setBootCompleted(true)} />;
  }
  ```
  Since `!booted` becomes `true`, `App.tsx` immediately mounts `<BootScreen>`, which runs its 2-second boot animation and calls `onComplete={() => setBootCompleted(true)}`, rebooting the OS back into the desktop.
- **Impact:** Triggering "Shut Down" from the Start Menu, Quick Settings, or shell `shutdown` command reboots the system instead of powering off.
- **Recommended Fix:** Introduce an explicit `isPoweredOff` state with a dedicated "System is powered down" shutdown splash screen with a "Power On" button.

---

### 1.4 Installed Packages Lost on Page Refresh (`packageManager.init()` Never Called)
- **Files:** `src/core/context.tsx` (Lines 90–109), `src/pkg/packageManager.ts` (Lines 20–43)
- **Description:** `packageManager.init()` reads the installed package state from `/var/lib/aetherpkg/installed.json`. However, it is only called in unit tests and **never called during system boot** in `context.tsx`.
- **Impact:** Installing or removing packages via `aetherpkg` or Software Center persists to VFS, but upon browser refresh, `packageManager` resets to default repository values, forgetting all installed packages.
- **Recommended Fix:** Add `await packageManager.init();` directly after `await vfs.init();` in `src/core/context.tsx`.

---

### 1.5 Broken / Phantom Package `audio-recorder` in Official Repository
- **Files:** `src/pkg/repository.ts` (Lines 58–69), `src/apps/appRegistry.ts`
- **Description:** `OFFICIAL_REPOSITORY` defines package `audio-recorder` with `appId: 'audio-recorder'`. However, `appRegistry.ts` contains **no registered component or definition** for `audio-recorder`.
- **Impact:** Installing `audio-recorder` creates an orphaned entry that crashes when clicked (`Failed to open window: unknown app 'audio-recorder'`).
- **Recommended Fix:** Implement `AudioRecorderApp` and register it in `appRegistry.ts`, or remove `audio-recorder` from `OFFICIAL_REPOSITORY`.

---

### 1.6 Web Browser Iframe Sandbox Escalation Risk
- **File:** `src/apps/webBrowser/WebBrowserApp.tsx` (Line 213)
- **Description:** The iframe is configured with `sandbox="allow-scripts allow-forms allow-same-origin allow-popups"`.
- **Security Impact:** The combination of `allow-scripts` and `allow-same-origin` allows embedded same-origin content to access `window.parent`, bypass sandbox constraints, and execute arbitrary code in the main AetherOS app.
- **Recommended Fix:** Remove `allow-same-origin` from the iframe sandbox flags.

---

## 📂 Category 2: Virtual Filesystem (VFS) & Shell Engine (aesh) Issues

### 2.1 `vfs.mkdir` Fails on Existing Directory Even With `recursive: true` (`mkdir -p`)
- **File:** `src/vfs/vfs.ts` (Lines 351–353)
- **Description:** `mkdir` unconditionally throws `EEXIST: file or directory already exists` if `this.exists(norm)`, completely ignoring `options?.recursive`.
- **Impact:** `mkdir -p existing_folder` throws `EEXIST` and exits with error code 1. Recursive directory copies (`vfs.copy`) also fail if the target directory already exists.
- **Recommended Fix:**
  ```ts
  if (this.exists(norm)) {
    if (options?.recursive) return;
    throw new Error(`EEXIST: file or directory already exists, mkdir '${path}'`);
  }
  ```

---

### 2.2 `vfs.mkdir` Does Not Verify That Parent Path is a Directory
- **File:** `src/vfs/vfs.ts` (Lines 358–364)
- **Description:** `mkdir` checks `if (!this.exists(parentPath))`, but does not verify that `parentPath` is a directory (`parent.type === 'dir'`).
- **Impact:** Calling `mkdir('/file.txt/dir')` when `/file.txt` is a regular file succeeds and creates a child directory under a file node, violating POSIX hierarchy.
- **Recommended Fix:** Add `if (parent && parent.type !== 'dir') throw new Error(`ENOTDIR: not a directory, '${parentPath}'`);`.

---

### 2.3 `vfs.rename` Leaves Orphaned Children When Overwriting Directories
- **File:** `src/vfs/vfs.ts` (Lines 573–587)
- **Description:** If `newPath` already exists as a directory and a file is moved over it, the directory node is replaced with a file node without deleting its child nodes.
- **Impact:** Orphaned children remain in `this.nodes` with no valid parent directory.

---

### 2.4 Shell `mv` Multi-File Target Reassignment Bug
- **File:** `src/shell/commands/fsCommands.ts` (Lines 265–274)
- **Description:** When running `mv file1.txt file2.txt targetDir/`:
  On the first iteration, `resolvedDest` is reassigned:
  `resolvedDest = vfs.resolve(resolvedDest, srcName);` (`targetDir/file1.txt`).
  On the second iteration, `resolvedDest` remains `targetDir/file1.txt` (now a regular file).
- **Impact:** `file2.txt` overwrites `targetDir/file1.txt` instead of moving to `targetDir/file2.txt`.
- **Recommended Fix:** Do not mutate `resolvedDest` inside the loop; derive `const curDest = isDir ? vfs.resolve(resolvedDest, srcName) : resolvedDest;`.

---

### 2.5 Glob Expansion (`expandGlobs`) Strips Directory Path Prefix
- **File:** `src/shell/environment.ts` (Lines 85–91)
- **Description:** When a pattern includes directory paths (e.g. `cat /home/aether/Documents/*.txt`), `matches` returns only `e.name` (e.g. `['note1.txt']`).
- **Impact:** Commands receive relative filenames instead of full paths. `cat /etc/*.conf` becomes `cat hosts os-release`, which fails because the shell working directory is `/home/aether`.
- **Recommended Fix:** If `isDirSearch` is true, prefix matches with `dirPart + '/' + e.name`.

---

### 2.6 `wc` Command Discards Flags When Reading From Stdin
- **File:** `src/shell/commands/fsCommands.ts` (Lines 591–594)
- **Description:** When `files.length === 0`, line 593 unconditionally returns `${c.lines} ${c.words} ${c.bytes}\n`.
- **Impact:** Running `cat file | wc -l` prints lines, words, and bytes (`10 50 320`) instead of just line count (`10`).
- **Recommended Fix:** Honor `showLines`, `showWords`, and `showBytes` when formatting stdout for stdin inputs.

---

### 2.7 Shell Variable Expansion Omitted for Command Name
- **File:** `src/shell/executor.ts` (Lines 87–106)
- **Description:** `expandVariables` is only invoked on arguments, never on `cmdName`.
- **Impact:** Running `$EDITOR myfile` or `$CMD` fails with `aesh: $EDITOR: command not found`.
- **Recommended Fix:** Apply `expandVariables(cmdName, context)` before looking up commands or aliases.

---

### 2.8 `printf` Built-in Ignores All Arguments
- **File:** `src/shell/commands/textCommands.ts` (Lines 41–47)
- **Description:** `printf` processes escape sequences in `args[0]` and returns it, completely ignoring format arguments (`args.slice(1)`).
- **Recommended Fix:** Implement basic `%s`, `%d`, `%f` format specifier replacement.

---

### 2.9 `grep` Throws Unhandled Regex Syntax Errors & Incomplete Highlighting
- **File:** `src/shell/commands/fsCommands.ts` (Line 440)
- **Description:** `new RegExp(patternStr)` is not wrapped in `try/catch`. Running `grep '['` or `grep '*'` throws an unhandled `SyntaxError`. Additionally, `line.replace(regex, ...)` lacks the `/g` flag, only highlighting the first match per line.
- **Recommended Fix:** Wrap `new RegExp` in a `try/catch` and return exit code 2 on invalid regex. Use a global regex for match highlighting.

---

### 2.10 `base64` Command Crashes on UTF-8 / Unicode Characters
- **File:** `src/shell/commands/devCommands.ts` (Lines 25–29)
- **Description:** Directly calls `btoa(text)` and `atob(text)`.
- **Impact:** Encoding any string with characters outside Latin1 (e.g. emojis, accented characters, CJK) throws a `DOMException: The string to be encoded contains characters outside of the Latin1 range.`
- **Recommended Fix:** Encode/decode UTF-8 byte arrays using `TextEncoder` / `TextDecoder` and `Uint8Array`.

---

### 2.11 `ping` Statistics Always Report 0% Packet Loss
- **File:** `src/shell/commands/netCommands.ts` (Line 52)
- **Description:** Line 52 hardcodes `${count} packets transmitted, ${count} received, 0% packet loss` even when all HTTP reachability requests timed out.
- **Recommended Fix:** Track `receivedCount` and compute actual packet loss percentage.

---

### 2.12 Search Indexer Returns Empty Array on Initial Query
- **File:** `src/vfs/searchIndexer.ts` (Lines 41–49)
- **Description:** `searchFiles` calls `this.updateIndex()` without awaiting it when `lastIndexed === 0`.
- **Impact:** The very first query typed into the Command Palette always returns zero file results.

---

## 🖥️ Category 3: Desktop Environment & Window Compositor Issues

### 3.1 Taskbar Only Displays 8 Pinned Apps (Minimized Apps Disappear)
- **File:** `src/desktop/components/Taskbar.tsx` (Lines 47–56, 133–161)
- **Description:** The taskbar iterates exclusively over `pinnedApps` (8 apps).
- **Impact:** Running Calculator, Media Player, Image Viewer, Notes, Document Viewer, Log Viewer, Minesweeper, 2048, Paint, or Weather never shows an icon on the Taskbar. If the user minimizes any of these windows, **they disappear completely from view with no way to restore them from the dock**.
- **Recommended Fix:** Combine `pinnedApps` with any active windows that are not pinned so all running tasks are accessible.

---

### 3.2 Desktop Does Not Display Files Located in `/home/aether/Desktop`
- **File:** `src/desktop/components/Desktop.tsx` (Lines 41–84, 130–158)
- **Description:** `Desktop.tsx` only renders a static list of 7 hardcoded shortcut icons.
- **Impact:** Creating files or folders via the desktop right-click menu ("New Folder", "New Text File") or shell commands in `~/Desktop` never appear on the desktop surface.
- **Recommended Fix:** Watch and read `/home/aether/Desktop` in VFS and render real desktop entries dynamically.

---

### 3.3 Window Title Direct Prop Mutation Anti-Pattern
- **File:** `src/desktop/components/WindowFrame.tsx` (Lines 313–315)
- **Description:** Line 314 executes `win.title = t;` directly on the `WindowInstance` prop.
- **Impact:** Direct mutation does not trigger React state updates, leaving the titlebar and taskbar with stale titles.
- **Recommended Fix:** Add an `updateWindowTitle(id: string, title: string)` callback in `SystemContext`.

---

### 3.4 Taskbar Mute Toggle Does Not Update Icon State
- **File:** `src/desktop/components/Taskbar.tsx` (Lines 169–178)
- **Description:** Clicking volume toggle calls `audioService.toggleMute()`, but `Taskbar` has no React state listening to mute changes.
- **Impact:** The volume mute icon does not update until the 1-second clock interval ticks and re-renders the component.

---

### 3.5 Dock Position Incompatibilities (Top & Left Positions)
- **Files:** `src/desktop/components/WindowFrame.tsx` (Line 228), `src/desktop/components/QuickSettings.tsx` (Line 49), `src/desktop/components/NotificationCenter.tsx` (Lines 32, 58)
- **Description:**
  1. Maximized and snapped windows hardcode `height: 'calc(100% - 44px)'` and `top: 0`. When dock position is set to `top`, maximized windows slide behind the dock. When dock is set to `left`, the window overlaps the dock.
  2. QuickSettings and NotificationCenter are hardcoded to `bottom-14 right-4`, detaching from the taskbar when the dock is positioned at the top.
- **Recommended Fix:** Derive position offsets dynamically from `theme.dockPosition`.

---

### 3.6 Floating Notification Toasts Never Auto-Dismiss
- **File:** `src/desktop/components/NotificationCenter.tsx` (Lines 32–53)
- **Description:** Toasts are rendered from `notifications.slice(0, 3)` without any auto-dismiss timer.
- **Impact:** Notifications stay floating on the screen indefinitely unless the user manually clicks `X` on each one.
- **Recommended Fix:** Add a 4–5 second auto-dismiss timeout per notification toast.

---

### 3.7 Alt+Tab State Re-Entrancy
- **File:** `src/core/context.tsx` (Lines 346–353)
- **Description:** `setWindows((prev) => { ... focusWindow(nextWindow.id); return prev; })` invokes `focusWindow` (which itself triggers state updates) inside a state updater function.
- **Impact:** Anti-pattern causing state tearing or missed focus updates.

---

## 📱 Category 4: Built-in Applications Issues

### 4.1 Code Studio Ignores `filePath` Prop
- **File:** `src/apps/codeStudio/CodeStudioApp.tsx` (Lines 18–23)
- **Description:** Double-clicking any `.js`, `.ts`, `.html`, or `.css` file in File Manager opens `code-studio` passing `{ filePath: ... }`. Code Studio ignores `filePath` and always opens `/home/aether/Projects/web-demo/index.html`.
- **Recommended Fix:** Check `initialProps?.filePath` and set both `projectRoot` and `activeFile` accordingly.

---

### 4.2 Code Studio Live Preview Only Injects First CSS & JS File
- **File:** `src/apps/codeStudio/CodeStudioApp.tsx` (Lines 68–81)
- **Description:** Uses single `html.match(/<link...>/)` and `html.match(/<script...>/)` calls, matching and replacing only the single first tag.
- **Impact:** Web projects with multiple stylesheets or scripts only compile the first one in the live sandbox.
- **Recommended Fix:** Use global regex matching (`matchAll` or `replace` with `/g`) to replace all stylesheet links and script tags.

---

### 4.3 File Manager: Dead Code & Missing Cut/Copy/Paste UI
- **File:** `src/apps/fileManager/FileManagerApp.tsx` (Lines 47, 178–205)
- **Description:** `handleCopy`, `handleCut`, `handlePaste`, and `propertiesItem` are fully defined in code, but no toolbar buttons, context menu items, or keyboard shortcuts trigger them. Users cannot copy or paste files via GUI.

---

### 4.4 File Manager: Deleting Items in Trash Causes Recursive Renaming
- **File:** `src/apps/fileManager/FileManagerApp.tsx` (Lines 162–173)
- **Description:** When viewing Trash (`/home/aether/.trash`), selecting an item and clicking Delete calls `vfs.moveToTrash(p)`, which renames the item inside the Trash folder rather than permanently deleting it.
- **Recommended Fix:** If path is already inside `.trash`, directly call `vfs.unlink(p)` or `vfs.rmdir(p, { recursive: true })`.

---

### 4.5 Media Player Ignores `initialProps` and Audio Context Leaks
- **File:** `src/apps/mediaPlayer/MediaPlayerApp.tsx` (Lines 31–88)
- **Description:**
  1. Ignores `initialProps?.filePath` when opened by double-clicking music/video files in File Manager.
  2. Adjusting volume while playing does not update `gainRef.current.gain`.
  3. `AudioContext` is never closed on unmount, hitting browser limits after several opens.

---

### 4.6 Image Viewer Memory Leak & Local File Loading Failure
- **File:** `src/apps/imageViewer/ImageViewerApp.tsx` (Lines 18–27)
- **Description:**
  1. `URL.createObjectURL(blob)` is created without a corresponding `URL.revokeObjectURL(imageSrc)` cleanup.
  2. If an image file does not start with `data:image` and is not `.svg`, it falls back to `setImageSrc(filePath)` (e.g. `/home/aether/Pictures/pic.png`), which returns a 404 from the web server.

---

### 4.7 Text Editor Scroll Synchronization & Word Wrap
- **File:** `src/apps/textEditor/TextEditorApp.tsx` (Lines 205–233)
- **Description:**
  1. The line numbers gutter and textarea have separate scroll containers without synchronized `scrollTop`. Scrolling the textarea leaves line numbers static.
  2. No `Ctrl+S` keydown listener exists despite the button tooltip advertising `(Ctrl+S)`. Pressing `Ctrl+S` invokes browser save page.
  3. Editor tabs have no close (`X`) buttons.

---

### 4.8 Calculator Equation Evaluator Regex Collision
- **File:** `src/apps/calculator/CalculatorApp.tsx` (Lines 40–41)
- **Description:** `.replace(/e/g, 'Math.E')` replaces all lowercase `e` characters globally. Any expression or token containing `e` becomes malformed. In addition, consecutive decimal points (`1.2.3`) are not validated.

---

### 4.9 Document Viewer Standalone `<li>` Elements
- **File:** `src/apps/documentViewer/DocumentViewerApp.tsx` (Lines 73–78)
- **Description:** Bullet list items (`- `) are rendered as individual `<li>` nodes directly inside a `<div>` without a parent `<ul>` container.

---

## 🧹 Category 5: Linter Warnings & Code Hygiene

Running `npm run lint` (`oxlint`) reports **75 warnings** across 62 files:
- **Unused imports:** e.g. `Plus`, `HardDrive`, `RefreshCw` in `Desktop.tsx`; `ArrowLeft`, `ArrowRight` in `WebBrowserApp.tsx`; `Layers` in `QuickSettings.tsx`; `Check` in `SoftwareCenterApp.tsx`.
- **Unused state variables:** e.g. `loadError` in `WebBrowserApp.tsx`, `propertiesItem` in `FileManagerApp.tsx`.
- **React Compiler warning:** Calling `setState` synchronously within effects (e.g. `CommandPalette.tsx`, `FileManagerApp.tsx`).
- **React Hook missing dependency:** `playSynthesizedAmbient` in `MediaPlayerApp.tsx`.

---

## 🎯 Recommended Remediation Roadmap

1. **Phase 1: Input & System Stability (Immediate)**
   - Fix 2048 & Calculator global keyboard capture.
   - Fix shutdown loop (distinguish power-down from reboot).
   - Call `packageManager.init()` in boot sequence.
   - Remove phantom `audio-recorder` package or register app.

2. **Phase 2: Filesystem & Shell Accuracy (High Priority)**
   - Fix `vfs.mkdir` recursive check on existing directories.
   - Fix `mv` multi-file destination loop mutation.
   - Fix `expandGlobs` directory prefix stripping.
   - Fix `wc` flag handling on stdin.
   - Secure `WebBrowserApp` iframe sandbox.

3. **Phase 3: Desktop & Window Compositor (User Experience)**
   - Display real files on Desktop surface.
   - Show all running windows in Taskbar (not just pinned).
   - Fix window title updating mechanism.
   - Add auto-dismiss to notification toasts.

4. **Phase 4: App Integration & Polish (Quality of Life)**
   - Connect `initialProps.filePath` in Code Studio and Media Player.
   - Add Copy/Cut/Paste actions to File Manager.
   - Synchronize Text Editor line numbers scrolling.
   - Clean up the 75 oxlint warnings.
