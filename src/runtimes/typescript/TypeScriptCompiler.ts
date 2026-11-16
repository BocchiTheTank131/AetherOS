import { vfs } from '../../vfs/vfs';
import { isWithin, withoutSymlinks } from '../../vfs/safePath';
import { runCompiler, type CompilerRequest } from './compilerClient';
import type { TSCompileOptions, TSCompileResult, TSDiagnostic } from './types';

export function compilerProject(root: string, options: TSCompileOptions, overlays?: Record<string, string>) {
  root = withoutSymlinks(root);
  const configPath = options.configPath ? vfs.resolve(root, options.configPath) : vfs.resolve(root, 'tsconfig.json');
  const explicitFiles = new Set([options.entryFile, ...(options.files ?? [])]);
  const outDir = options.outDir ? vfs.resolve(root, options.outDir) : undefined;
  const files: Record<string, string> = Object.create(null);
  let total = 0;
  let count = 0;
  const add = (path: string, code: string) => {
    if (!isWithin(path, root)) throw new Error(`TypeScript input is outside the project: ${path}`);
    total += code.length;
    if (total > 12 * 1024 * 1024 || ++count > 3000) {
      throw new Error('TypeScript project exceeds the worker snapshot limit');
    }
    files[path] = code;
  };
  for (const node of vfs.getAllNodes()) {
    if (node.type !== 'file' || !isWithin(node.path, root)) continue;
    const parts = node.path.slice(root === '/' ? 1 : root.length + 1).split('/');
    if (parts.includes('.git') || parts.includes('.trash') || parts.includes('.config') ||
        (parts[0] === 'dist' && !explicitFiles.has(node.path)) ||
        (outDir && isWithin(node.path, outDir) && !explicitFiles.has(node.path))) continue;
    if (Object.hasOwn(overlays ?? {}, node.path)) continue;
    if (node.path !== configPath && !/\.(?:[cm]?[jt]sx?|json)$/i.test(node.path)) continue;
    if (!vfs.checkAccess(node.path, 'r')) continue;
    if (node.size > 12 * 1024 * 1024) throw new Error(`TypeScript input exceeds the snapshot limit: ${node.path}`);
    add(node.path, vfs.readText(node.path));
  }
  for (const [path, code] of Object.entries(overlays ?? {})) add(withoutSymlinks(path), code);
  return { root, options: { ...options, configPath, outDir }, files };
}

export class TypeScriptCompiler {
  public version(): Promise<string> {
    return runCompiler({ action: 'version' });
  }

  public transpile(code: string, file = 'inline.ts'): Promise<{ outputText: string; diagnostics: TSDiagnostic[] }> {
    return runCompiler({ action: 'transpile', code, file });
  }

  public async typeCheck(file: string, code: string): Promise<TSDiagnostic[]> {
    const path = vfs.resolve('/@inline', file.split('/').pop() ?? 'inline.ts');
    const result = await runCompiler<TSCompileResult>({
      action: 'compile', root: '/@inline', files: { [path]: code },
      options: { entryFile: path, noEmit: true },
    });
    return result.diagnostics;
  }

  public async compile(
    options: TSCompileOptions,
    overlays?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<TSCompileResult> {
    const cwd = vfs.normalizePath(options.cwd ?? '/home/aether');
    const configPath = options.configPath ? vfs.resolve(cwd, options.configPath) : vfs.resolve(cwd, 'tsconfig.json');
    const root = vfs.exists(configPath) && !isWithin(configPath, cwd)
      ? configPath.slice(0, configPath.lastIndexOf('/')) || '/'
      : cwd;
    const entryFile = options.entryFile ? vfs.resolve(cwd, options.entryFile) : undefined;
    const { sourceCode, ...compilerOptions } = options;
    const input: CompilerRequest = {
      action: 'compile',
      ...compilerProject(root, { ...compilerOptions, entryFile, configPath }, entryFile && sourceCode !== undefined
        ? { ...overlays, [entryFile]: sourceCode } : overlays),
    };
    const result = await runCompiler<TSCompileResult>(input, signal);
    signal?.throwIfAborted();
    if (result.success && result.outputFiles && !options.noEmit) {
      vfs.atomicBatch(() => {
        for (const [path, content] of Object.entries(result.outputFiles!)) {
          const dest = withoutSymlinks(path);
          if (!isWithin(dest, root) || Object.hasOwn(input.files, dest) || !vfs.checkAccess(dest, 'w')) {
            throw new Error(`TypeScript cannot overwrite this path: ${path}`);
          }
          vfs.mkdir(dest.slice(0, dest.lastIndexOf('/')) || '/', { recursive: true });
          vfs.writeText(dest, content);
        }
      });
    }
    return result;
  }
}

export const typeScriptCompiler = new TypeScriptCompiler();
