// AetherOS - Semantic Versioning & Dependency Resolver

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export function parseSemver(v: string): ParsedSemver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?$/.exec(v.trim());
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);

  if (!p1 || !p2) {
    return v1.localeCompare(v2);
  }

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  // Prerelease comparison: non-prerelease is greater than prerelease
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && !p2.prerelease) return -1;
  if (p1.prerelease && p2.prerelease) {
    return p1.prerelease.localeCompare(p2.prerelease);
  }

  return 0;
}

export function satisfiesSemver(version: string, range: string): boolean {
  const cleanRange = range.trim();
  if (cleanRange === '*' || cleanRange === '') return true;

  const parsed = parseSemver(version);
  if (!parsed) return false;

  // Caret ^1.2.3: allow changes that do not modify the left-most non-zero digit
  if (cleanRange.startsWith('^')) {
    const target = parseSemver(cleanRange.slice(1));
    if (!target) return false;
    if (parsed.major !== target.major) return false;
    return compareSemver(version, cleanRange.slice(1)) >= 0;
  }

  // Tilde ~1.2.3: allow patch-level changes if minor is specified
  if (cleanRange.startsWith('~')) {
    const target = parseSemver(cleanRange.slice(1));
    if (!target) return false;
    if (parsed.major !== target.major || parsed.minor !== target.minor) return false;
    return compareSemver(version, cleanRange.slice(1)) >= 0;
  }

  // >=, >, <=, <
  if (cleanRange.startsWith('>=')) {
    return compareSemver(version, cleanRange.slice(2).trim()) >= 0;
  }
  if (cleanRange.startsWith('>')) {
    return compareSemver(version, cleanRange.slice(1).trim()) > 0;
  }
  if (cleanRange.startsWith('<=')) {
    return compareSemver(version, cleanRange.slice(2).trim()) <= 0;
  }
  if (cleanRange.startsWith('<')) {
    return compareSemver(version, cleanRange.slice(1).trim()) < 0;
  }

  // Exact version
  return compareSemver(version, cleanRange) === 0;
}

export interface DependencyCheckResult {
  satisfied: boolean;
  missing: Array<{ id: string; requiredVersion: string }>;
  incompatible: Array<{ id: string; installedVersion: string; requiredVersion: string }>;
  cycle?: string[];
}

export class PackageResolver {
  public static verifyDependencies(
    dependencies: Record<string, string>,
    getInstalledVersion: (id: string) => string | undefined
  ): DependencyCheckResult {
    const missing: Array<{ id: string; requiredVersion: string }> = [];
    const incompatible: Array<{ id: string; installedVersion: string; requiredVersion: string }> = [];

    for (const [depId, reqRange] of Object.entries(dependencies)) {
      const installedVer = getInstalledVersion(depId);
      if (!installedVer) {
        missing.push({ id: depId, requiredVersion: reqRange });
      } else if (!satisfiesSemver(installedVer, reqRange)) {
        incompatible.push({ id: depId, installedVersion: installedVer, requiredVersion: reqRange });
      }
    }

    return {
      satisfied: missing.length === 0 && incompatible.length === 0,
      missing,
      incompatible,
    };
  }
}
