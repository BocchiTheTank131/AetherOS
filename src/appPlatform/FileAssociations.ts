// AetherOS - File Associations Manager
import type { FileAssociation } from './AppManifest';

export class FileAssociations {
  private extToApps = new Map<string, string[]>();

  public registerAssociations(appId: string, associations: FileAssociation[]): void {
    for (const assoc of associations) {
      const ext = assoc.extension.toLowerCase();
      const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
      const list = this.extToApps.get(cleanExt) || [];
      if (!list.includes(appId)) {
        list.push(appId);
        this.extToApps.set(cleanExt, list);
      }
    }
  }

  public unregisterAssociations(appId: string): void {
    for (const [ext, apps] of this.extToApps.entries()) {
      const filtered = apps.filter((id) => id !== appId);
      if (filtered.length === 0) {
        this.extToApps.delete(ext);
      } else {
        this.extToApps.set(ext, filtered);
      }
    }
  }

  public getAppsForExtension(ext: string): string[] {
    const cleanExt = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return this.extToApps.get(cleanExt) || [];
  }
}

export const fileAssociations = new FileAssociations();
