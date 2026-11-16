import ts from 'aether-typescript';
import * as esbuild from 'esbuild-wasm';
import wasmURL from 'esbuild-wasm/esbuild.wasm?url';

let initialized: Promise<void> | undefined;

export async function bundleProject(entry: string, files: {
  hasFile: (path: string) => boolean;
  readFile: (path: string) => string | undefined;
  directoryExists: (path: string) => boolean;
}, options: ts.CompilerOptions): Promise<string> {
  if (import.meta.env.MODE !== 'test' || typeof document !== 'undefined') {
    await (initialized ??= esbuild.initialize({ wasmURL, worker: false }));
  }
  const { outputFiles } = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    legalComments: 'inline',
    sourcemap: 'inline',
    logLevel: 'silent',
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: options.experimentalDecorators,
        jsxFactory: options.jsxFactory,
        jsxFragmentFactory: options.jsxFragmentFactory,
        jsxImportSource: options.jsxImportSource,
        useDefineForClassFields: options.useDefineForClassFields,
      },
    },
    jsx: options.jsx === ts.JsxEmit.ReactJSX || options.jsx === ts.JsxEmit.ReactJSXDev ? 'automatic' : 'transform',
    plugins: [{
      name: 'aetherfs',
      setup(build) {
        build.onResolve({ filter: /.*/ }, ({ path, importer }) => {
          if (!importer && files.hasFile(path)) return { path, namespace: 'aetherfs' };
          const resolved = ts.resolveModuleName(path, importer, options, {
            fileExists: files.hasFile,
            readFile: files.readFile,
            directoryExists: files.directoryExists,
          }).resolvedModule?.resolvedFileName;
          if (!resolved || /\.d\.[cm]?ts$/.test(resolved)) {
            return { errors: [{ text: `Cannot bundle "${path}" imported by ${importer || entry}` }] };
          }
          return { path: resolved, namespace: 'aetherfs' };
        });
        build.onLoad({ filter: /.*/, namespace: 'aetherfs' }, ({ path }) => {
          const ext = path.slice(path.lastIndexOf('.') + 1);
          const loader = ext === 'tsx' ? 'tsx' : ['ts', 'mts', 'cts'].includes(ext) ? 'ts' :
            ext === 'json' ? 'json' : ext === 'jsx' ? 'jsx' : 'js';
          return { contents: files.readFile(path), loader };
        });
      },
    }],
  });
  return outputFiles![0].text;
}
