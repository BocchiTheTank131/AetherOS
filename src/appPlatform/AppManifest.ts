// AetherOS - Application Manifest Specification & Validator
import type { PermissionScope } from './AppPermissions';
import { VALID_PERMISSION_SCOPES } from './AppPermissions';

export interface FileAssociation {
  extension: string; // e.g. '.md' or 'md'
  mimeType?: string; // e.g. 'text/markdown'
  name?: string;     // e.g. 'Markdown Document'
}

export interface WindowConfig {
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
}

export interface AppManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  type: 'windowed' | 'cli';
  entry: string;
  icon?: string;
  minAetherVersion?: string;
  window?: WindowConfig;
  permissions?: PermissionScope[];
  dependencies?: Record<string, string>;
  fileAssociations?: FileAssociation[];
  sdkVersion?: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: AppManifest;
}

const ID_REGEX = /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

export function validateManifest(raw: unknown): ManifestValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Manifest must be a JSON object'] };
  }

  const obj = raw as Record<string, unknown>;

  // schemaVersion
  if (obj.schemaVersion !== 1) {
    errors.push("Invalid or unsupported 'schemaVersion': must be 1");
  }

  // id
  if (typeof obj.id !== 'string' || !ID_REGEX.test(obj.id)) {
    errors.push(
      "Invalid 'id': must be lowercase reverse-DNS format (e.g. 'dev.aether.myapp', alphanumeric with dots/hyphens)"
    );
  }

  // name
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0 || obj.name.length > 64) {
    errors.push("Invalid 'name': must be a string between 1 and 64 characters");
  }

  // version
  if (typeof obj.version !== 'string' || !SEMVER_REGEX.test(obj.version)) {
    errors.push("Invalid 'version': must follow semantic versioning format (e.g. '1.0.0')");
  }

  // description
  if (typeof obj.description !== 'string') {
    errors.push("Invalid 'description': must be a string");
  }

  // author
  if (typeof obj.author !== 'string') {
    errors.push("Invalid 'author': must be a string");
  }

  // type
  if (obj.type !== 'windowed' && obj.type !== 'cli') {
    errors.push("Invalid 'type': must be either 'windowed' or 'cli'");
  }

  // entry
  if (
    typeof obj.entry !== 'string' ||
    obj.entry.trim().length === 0 ||
    obj.entry.startsWith('/') ||
    obj.entry.includes('..') ||
    obj.entry.includes('\0')
  ) {
    errors.push("Invalid 'entry': must be a safe relative path within the archive (e.g. 'index.html')");
  }

  // window configuration
  let windowConfig: WindowConfig | undefined;
  if (obj.window !== undefined) {
    if (typeof obj.window !== 'object' || obj.window === null) {
      errors.push("Invalid 'window': must be an object if specified");
    } else {
      const win = obj.window as Record<string, unknown>;
      windowConfig = {};

      if (win.defaultWidth !== undefined) {
        if (typeof win.defaultWidth !== 'number' || win.defaultWidth < 200 || win.defaultWidth > 3840) {
          errors.push("'window.defaultWidth' must be a number between 200 and 3840");
        } else {
          windowConfig.defaultWidth = win.defaultWidth;
        }
      }

      if (win.defaultHeight !== undefined) {
        if (typeof win.defaultHeight !== 'number' || win.defaultHeight < 150 || win.defaultHeight > 2160) {
          errors.push("'window.defaultHeight' must be a number between 150 and 2160");
        } else {
          windowConfig.defaultHeight = win.defaultHeight;
        }
      }

      if (win.minWidth !== undefined) {
        if (typeof win.minWidth !== 'number' || win.minWidth < 100) {
          errors.push("'window.minWidth' must be a number >= 100");
        } else {
          windowConfig.minWidth = win.minWidth;
        }
      }

      if (win.minHeight !== undefined) {
        if (typeof win.minHeight !== 'number' || win.minHeight < 80) {
          errors.push("'window.minHeight' must be a number >= 80");
        } else {
          windowConfig.minHeight = win.minHeight;
        }
      }

      if (win.resizable !== undefined) {
        if (typeof win.resizable !== 'boolean') {
          errors.push("'window.resizable' must be a boolean");
        } else {
          windowConfig.resizable = win.resizable;
        }
      }
    }
  }

  // permissions
  let permissions: PermissionScope[] | undefined;
  if (obj.permissions !== undefined) {
    if (!Array.isArray(obj.permissions)) {
      errors.push("Invalid 'permissions': must be an array of strings");
    } else {
      permissions = [];
      for (const p of obj.permissions) {
        if (typeof p !== 'string' || !VALID_PERMISSION_SCOPES.includes(p as PermissionScope)) {
          errors.push(`Unsupported or invalid permission scope: '${String(p)}'`);
        } else {
          permissions.push(p as PermissionScope);
        }
      }
    }
  }

  // dependencies
  let dependencies: Record<string, string> | undefined;
  if (obj.dependencies !== undefined) {
    if (typeof obj.dependencies !== 'object' || obj.dependencies === null || Array.isArray(obj.dependencies)) {
      errors.push("Invalid 'dependencies': must be a key-value object of package IDs to version requirements");
    } else {
      dependencies = {};
      for (const [depId, versionReq] of Object.entries(obj.dependencies)) {
        if (typeof versionReq !== 'string') {
          errors.push(`Invalid version constraint for dependency '${depId}'`);
        } else {
          dependencies[depId] = versionReq;
        }
      }
    }
  }

  // fileAssociations
  let fileAssociations: FileAssociation[] | undefined;
  if (obj.fileAssociations !== undefined) {
    if (!Array.isArray(obj.fileAssociations)) {
      errors.push("Invalid 'fileAssociations': must be an array");
    } else {
      fileAssociations = [];
      for (const fa of obj.fileAssociations) {
        if (!fa || typeof fa !== 'object' || typeof (fa as FileAssociation).extension !== 'string') {
          errors.push("Each entry in 'fileAssociations' must have an 'extension' string");
        } else {
          const item = fa as FileAssociation;
          fileAssociations.push({
            extension: item.extension.startsWith('.') ? item.extension : `.${item.extension}`,
            mimeType: item.mimeType,
            name: item.name,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const manifest: AppManifest = {
    schemaVersion: 1,
    id: obj.id as string,
    name: (obj.name as string).trim(),
    version: obj.version as string,
    description: (obj.description as string) || '',
    author: (obj.author as string) || '',
    license: typeof obj.license === 'string' ? obj.license : undefined,
    type: obj.type as 'windowed' | 'cli',
    entry: obj.entry as string,
    icon: typeof obj.icon === 'string' ? obj.icon : undefined,
    minAetherVersion: typeof obj.minAetherVersion === 'string' ? obj.minAetherVersion : undefined,
    window: windowConfig,
    permissions,
    dependencies,
    fileAssociations,
    sdkVersion: typeof obj.sdkVersion === 'string' ? obj.sdkVersion : undefined,
  };

  return { valid: true, errors: [], manifest };
}
