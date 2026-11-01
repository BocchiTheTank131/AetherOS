// AetherOS - Package Archive Content & Manifest Validator
import { PackageArchive } from './packageArchive';
import { validateManifest, type AppManifest } from '../appPlatform/AppManifest';
import { verifyIntegrityManifest } from './packageIntegrity';

export interface PackageValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: AppManifest;
}

export class PackageValidator {
  /**
   * Validates an unpacked package archive for completeness, manifest correctness, and entry existence.
   */
  public static async validate(files: Map<string, Uint8Array>): Promise<PackageValidationResult> {
    const errors: string[] = [];

    // 1. Check for manifest.json
    const manifestBytes = files.get('manifest.json');
    if (!manifestBytes) {
      return { valid: false, errors: ["Archive is missing required 'manifest.json' entry"] };
    }

    // 2. Parse and validate manifest schema
    let manifestText: string;
    let manifestJson: unknown;
    try {
      manifestText = PackageArchive.readText(files, 'manifest.json');
      manifestJson = JSON.parse(manifestText);
    } catch (err) {
      return { valid: false, errors: [`Failed to parse 'manifest.json' as JSON: ${String(err)}`] };
    }

    const manifestRes = validateManifest(manifestJson);
    if (!manifestRes.valid || !manifestRes.manifest) {
      return { valid: false, errors: manifestRes.errors };
    }

    const manifest = manifestRes.manifest;

    // 3. Check that the entry point exists in archive
    const normEntry = manifest.entry.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!files.has(normEntry)) {
      errors.push(`Declared entry file '${manifest.entry}' not found in package archive`);
    }

    // 4. Check icon file if specified as local path (e.g. assets/icon.png)
    if (manifest.icon && manifest.icon.includes('/')) {
      const normIcon = manifest.icon.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!files.has(normIcon)) {
        errors.push(`Declared icon file '${manifest.icon}' not found in package archive`);
      }
    }

    // 5. Verify integrity.json if present
    const integrityBytes = files.get('integrity.json');
    if (integrityBytes) {
      try {
        const integrityText = PackageArchive.readText(files, 'integrity.json');
        const integrityObj = JSON.parse(integrityText);
        const integrityCheck = await verifyIntegrityManifest(files, integrityObj);
        if (!integrityCheck.valid) {
          if (integrityCheck.missing.length > 0) {
            errors.push(
              `Integrity check failed: missing files declared in integrity.json: ${integrityCheck.missing.join(', ')}`
            );
          }
          if (integrityCheck.mismatched.length > 0) {
            errors.push(
              `Integrity check failed: checksum mismatch for: ${integrityCheck.mismatched.join(', ')}`
            );
          }
        }
      } catch (err) {
        errors.push(`Failed to parse or verify 'integrity.json': ${String(err)}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      manifest,
    };
  }
}
