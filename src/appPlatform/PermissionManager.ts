// AetherOS - Centralized Application Permission Manager
import type {
  PermissionScope,
  PermissionGrantState,
  AppPermissionRecord,
} from './AppPermissions';
import { VALID_PERMISSION_SCOPES, PERMISSION_METADATA } from './AppPermissions';
import { vfs } from '../vfs/vfs';
import { systemLogger } from '../core/logger';
import { systemEventBus } from '../core/eventBus';

const PERMISSIONS_FILE = '/var/lib/aetherpkg/permissions.json';

export type PermissionChangeListener = (event: {
  appId: string;
  scope: PermissionScope;
  state: PermissionGrantState;
}) => void;

export class PermissionManager {
  private records = new Map<string, AppPermissionRecord>();
  private sessionGrants = new Map<string, Set<PermissionScope>>();
  private listeners = new Set<PermissionChangeListener>();
  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!vfs.exists('/var/lib/aetherpkg')) {
        vfs.mkdir('/var/lib/aetherpkg', { recursive: true });
      }

      if (vfs.exists(PERMISSIONS_FILE)) {
        const raw = vfs.readFile(PERMISSIONS_FILE);
        const parsed: Record<string, AppPermissionRecord> = JSON.parse(raw);
        for (const [id, rec] of Object.entries(parsed)) {
          this.records.set(id, rec);
        }
      }
      this.initialized = true;
    } catch (err) {
      systemLogger.warn('permissions', `Failed to load permissions: ${String(err)}`);
      this.initialized = true;
    }
  }

  private save(): void {
    try {
      if (!vfs.exists('/var/lib/aetherpkg')) {
        vfs.mkdir('/var/lib/aetherpkg', { recursive: true });
      }
      const data: Record<string, AppPermissionRecord> = {};
      for (const [id, rec] of this.records.entries()) {
        data[id] = rec;
      }
      vfs.writeFile(PERMISSIONS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      systemLogger.error('permissions', `Failed to save permissions: ${String(err)}`);
    }
  }

  public registerApp(
    appId: string,
    requestedScopes: PermissionScope[],
    autoGrantLowRisk = true
  ): AppPermissionRecord {
    const existing = this.records.get(appId);
    const validRequested = requestedScopes.filter((s) => VALID_PERMISSION_SCOPES.includes(s));

    if (existing) {
      // Merge new scopes
      for (const scope of validRequested) {
        if (!existing.requestedScopes.includes(scope)) {
          existing.requestedScopes.push(scope);
        }
        if (!existing.grants[scope]) {
          const meta = PERMISSION_METADATA[scope];
          existing.grants[scope] = autoGrantLowRisk && meta?.risk === 'low' ? 'granted' : 'prompt';
        }
      }
      existing.updatedAt = new Date().toISOString();
      this.save();
      return existing;
    }

    const grants: Record<string, PermissionGrantState> = {};
    for (const scope of validRequested) {
      const meta = PERMISSION_METADATA[scope];
      // Low risk permissions like storage:appdata and audio:playback are granted by default on install
      grants[scope] = autoGrantLowRisk && meta?.risk === 'low' ? 'granted' : 'prompt';
    }

    const rec: AppPermissionRecord = {
      appId,
      requestedScopes: validRequested,
      grants,
      lastUsed: {},
      updatedAt: new Date().toISOString(),
    };

    this.records.set(appId, rec);
    this.save();
    return rec;
  }

  public hasPermission(appId: string, scope: PermissionScope): boolean {
    // Check session-only grant first
    const sess = this.sessionGrants.get(appId);
    if (sess?.has(scope)) return true;

    const rec = this.records.get(appId);
    if (!rec) return false;

    return rec.grants[scope] === 'granted';
  }

  public getGrantState(appId: string, scope: PermissionScope): PermissionGrantState {
    const sess = this.sessionGrants.get(appId);
    if (sess?.has(scope)) return 'granted';

    const rec = this.records.get(appId);
    return rec?.grants[scope] || 'prompt';
  }

  public grantPermission(
    appId: string,
    scope: PermissionScope,
    duration: 'session' | 'always' = 'always'
  ): void {
    if (!VALID_PERMISSION_SCOPES.includes(scope)) return;

    if (duration === 'session') {
      if (!this.sessionGrants.has(appId)) {
        this.sessionGrants.set(appId, new Set());
      }
      this.sessionGrants.get(appId)!.add(scope);
    } else {
      let rec = this.records.get(appId);
      if (!rec) {
        rec = this.registerApp(appId, [scope], false);
      }
      rec.grants[scope] = 'granted';
      rec.updatedAt = new Date().toISOString();
      this.save();
    }

    systemLogger.info('permissions', `Granted '${scope}' to app '${appId}' (${duration})`);
    this.notify(appId, scope, 'granted');
    systemEventBus.emit('permission:changed', { appId, scope, state: 'granted' });
  }

  public denyPermission(appId: string, scope: PermissionScope): void {
    // Remove from session grants
    this.sessionGrants.get(appId)?.delete(scope);

    let rec = this.records.get(appId);
    if (!rec) {
      rec = this.registerApp(appId, [scope], false);
    }
    rec.grants[scope] = 'denied';
    rec.updatedAt = new Date().toISOString();
    this.save();

    systemLogger.info('permissions', `Denied '${scope}' for app '${appId}'`);
    this.notify(appId, scope, 'denied');
    systemEventBus.emit('permission:changed', { appId, scope, state: 'denied' });
  }

  public revokePermission(appId: string, scope: PermissionScope): void {
    this.sessionGrants.get(appId)?.delete(scope);

    const rec = this.records.get(appId);
    if (rec && rec.grants[scope]) {
      rec.grants[scope] = 'prompt';
      rec.updatedAt = new Date().toISOString();
      this.save();
    }

    systemLogger.info('permissions', `Revoked '${scope}' for app '${appId}'`);
    this.notify(appId, scope, 'prompt');
    systemEventBus.emit('permission:changed', { appId, scope, state: 'prompt' });
  }

  public resetPermissions(appId: string): void {
    this.sessionGrants.delete(appId);
    const rec = this.records.get(appId);
    if (rec) {
      for (const scope of rec.requestedScopes) {
        const meta = PERMISSION_METADATA[scope];
        rec.grants[scope] = meta?.risk === 'low' ? 'granted' : 'prompt';
      }
      rec.updatedAt = new Date().toISOString();
      this.save();
      for (const scope of rec.requestedScopes) {
        this.notify(appId, scope, rec.grants[scope]);
      }
    }
  }

  public recordUsage(appId: string, scope: PermissionScope): void {
    const rec = this.records.get(appId);
    if (rec) {
      if (!rec.lastUsed) rec.lastUsed = {};
      rec.lastUsed[scope] = new Date().toISOString();
      // Write-behind without excessive I/O
    }
  }

  public getAppRecord(appId: string): AppPermissionRecord | undefined {
    return this.records.get(appId);
  }

  public getAllRecords(): AppPermissionRecord[] {
    return Array.from(this.records.values());
  }

  public unregisterApp(appId: string): void {
    this.records.delete(appId);
    this.sessionGrants.delete(appId);
    this.save();
  }

  public subscribe(listener: PermissionChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(appId: string, scope: PermissionScope, state: PermissionGrantState): void {
    for (const listener of this.listeners) {
      try {
        listener({ appId, scope, state });
      } catch {}
    }
  }
}

export const permissionManager = new PermissionManager();
