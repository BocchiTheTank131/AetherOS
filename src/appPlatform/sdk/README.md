# Aether application SDK

AetherOS installs windowed applications from `.aepkg` archives. Declare an application ID in reverse-DNS form, a relative entry path and the scopes the application uses. Build with `aether build .` to include the SHA-256 manifest, and install the result with `aetherpkg install dist/<id>.aepkg`.

Guest code can call `window.aether` after the SDK initializes. Calls made during startup queue until the host connects. All RPC methods return promises. Handle denied permissions and request failures in the guest UI.

- `app.getInfo`, `app.close`, `window.setTitle`, `window.setMinimumSize`, and `system.getTheme` expose the active application and window controls.
- `storage.get/set/delete/list` require `storage:appdata`. Store JSON values and use string keys. The private directory has a 5 MiB quota.
- `fs.readText/readBytes/exists` and `fs.writeText/writeBytes` take absolute AetherFS paths. Private files require `storage:appdata`. Other eligible paths require `filesystem:read` or `filesystem:write`. Protected package metadata and other applications' private files are inaccessible. Symbolic links are rejected at this boundary.
- `notifications.show` requires `notifications`.
- `permissions.query/request` only consider scopes declared in the manifest. The desktop can grant a requested scope for the session or remember a denial. Users can revoke access in Settings.

Use ordinary local paths in HTML for packaged scripts, stylesheets and media. References resolve against the entry document's directory and stay inside the archive's installed root. A leading slash refers to the package root. Bundle dependent JavaScript modules into a local script before packaging. Installed frames have an opaque origin. Clipboard, network, camera, microphone and picker scopes are reserved for future host integrations. Code Studio preview enables console reporting while withholding installed-app filesystem, storage and notification scopes.
