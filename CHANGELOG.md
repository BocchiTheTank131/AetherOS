# Changelog

## 1.4.1 · Stability & Security

- Reproducible installation with `npm ci`, explicit browser Git dependencies and CI for lint, type checking, unit tests, production builds, Chromium and Firefox.
- Package entry points, inlined assets, storage and filesystem RPC enforce path boundaries and reject symbolic links at guest trust boundaries. An opaque iframe initiates its own authenticated SDK channel. Declared permissions require user approval when prompted.
- JavaScript and Python guest execution require workers. JavaScript workers run under an opaque origin and a restrictive Content Security Policy. Native tests exercise worker threads and real Pyodide WebAssembly.
- ZIP extraction validates central metadata before allocating output and enforces actual byte counts while inflating. Package files and registration are queued as one batch. Legacy archives without a checksum manifest remain installable with a warning.
- AetherFS exposes explicit flush and persistence status, keeps pending writes on failure and detects stale cross-tab writes in the IndexedDB transaction. Snapshot replacement commits atomically. The desktop retains windows during workspace switches and minimizes, and shuts down worker processes on power transitions.
- Production builds precache their versioned shell and serve it offline. The desktop prompts when a build is ready to activate.

IndexedDB durability depends on browser storage and completion of the transaction. In-memory work can be lost on forced termination. Cross-tab conflicts require saving or exporting affected work and reloading. Browser sandboxing limits capabilities without providing process-level memory quotas or full Linux compatibility.
