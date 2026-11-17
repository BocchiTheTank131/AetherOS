# Changelog

## 1.5.1 · Blue Hour

- Liquid Glass and Modern appearance styles with live Light, Dark, and System modes, custom accents, and a bundled offline wallpaper. Existing appearance preferences carry forward.
- Rebuilt Liquid Glass with live rounded-edge refraction on the dock and Quick Settings appearance module in Chromium, plus layered highlights, adaptive tint, and CSS fallbacks in Firefox and WebKit.
- Clear pill-shaped dock with larger layered icons, spring-like magnification, focused and running indicators, workspace controls, and auto-hide in bottom, top, and left positions.
- Floating Quick Settings modules with a vertical system-volume slider, animated appearance selection, and separate power controls. Refined window title bars, Settings navigation, desktop shortcuts, launcher, notification center, lock and boot screens, command palette, and dialogs.
- Solid materials for Modern and reduced transparency. Liquid Glass follows the system reduced-transparency preference where the browser exposes it.
- Shared appearance tokens across the built-in suite. Settings gains visual previews, Files adapts its navigation and layouts to window width, Code Studio and Terminal use readable editor and console surfaces, and System Monitor draws theme-aware performance charts.
- Windows stay within the work area when the viewport shrinks. Minimizing preserves snapped and maximized layouts. Destructive dialogs focus Cancel by default, and Paint, 2048, and Minesweeper support touch input.

## 1.5.0 · Real Developer Workstation

- Official TypeScript 6.0 compiler and incremental language service in a dedicated worker, with project-based checks, source navigation and esbuild WASM bundles.
- Code Studio 3.0 adds autosave, conflict checks, restored projects and tabs, configurable splits, preview sizes, console output and runtime error overlays.
- Shipped Pyodide assets load on demand and work offline after caching. Python sync applies only changed workspace files and protects concurrent edits. Selected Python wheels are pinned and checksum-verified.
- Developer tasks use virtual kernel PIDs, streamed output, cancellation and timeouts. Git handles staged deletions, index restore, binary diffs and clean branch switching.
- Code Studio and the Git engine load on demand. Playwright checks production workflows in Chromium and Firefox.

See the [workstation guide](README.md#developer-workstation) for supported commands and limits.

## 1.4.1 · Stability & Security

- Reproducible installation with `npm ci`, explicit browser Git dependencies and CI for lint, type checking, unit tests, production builds, Chromium and Firefox.
- Package entry points, inlined assets, storage and filesystem RPC enforce path boundaries and reject symbolic links at guest trust boundaries. An opaque iframe initiates its own authenticated SDK channel. Declared permissions require user approval when prompted.
- JavaScript and Python guest execution require workers. JavaScript workers run under an opaque origin and a restrictive Content Security Policy. Native tests exercise worker threads and real Pyodide WebAssembly.
- ZIP extraction validates central metadata before allocating output and enforces actual byte counts while inflating. Package files and registration are queued as one batch. Legacy archives without a checksum manifest remain installable with a warning.
- AetherFS exposes explicit flush and persistence status, keeps pending writes on failure and detects stale cross-tab writes in the IndexedDB transaction. Snapshot replacement commits atomically. The desktop retains windows during workspace switches and minimizes, and shuts down worker processes on power transitions.
- Production builds precache their versioned shell and serve it offline. The desktop prompts when a build is ready to activate.

IndexedDB durability depends on browser storage and completion of the transaction. In-memory work can be lost on forced termination. Cross-tab conflicts require saving or exporting affected work and reloading. Browser sandboxing limits capabilities without providing process-level memory quotas or full Linux compatibility.
