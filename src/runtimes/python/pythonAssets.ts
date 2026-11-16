import { computeSha256 } from '../../pkg/packageIntegrity';
import { PYODIDE_VERSION } from './pythonWorkerSource';
import loaderUrl from 'pyodide/pyodide.js?url&no-inline';
import asmUrl from 'pyodide/pyodide.asm.js?url&no-inline';
import wasmUrl from 'pyodide/pyodide.asm.wasm?url&no-inline';
import stdlibUrl from 'pyodide/python_stdlib.zip?url&no-inline';
import lockUrl from 'pyodide/pyodide-lock.json?url&no-inline';

const assets = {
  'pyodide.js': loaderUrl,
  'pyodide.asm.js': asmUrl,
  'pyodide.asm.wasm': wasmUrl,
  'python_stdlib.zip': stdlibUrl,
  'pyodide-lock.json': lockUrl,
};

let loading: Promise<Record<string, ArrayBuffer>> | undefined;
const supported = new Set(['mpmath', 'numpy', 'packaging', 'pytz', 'typing-extensions']);
const pendingWheels = new Map<string, Promise<ArrayBuffer>>();

async function readWheel(url: string, sha256: string): Promise<ArrayBuffer> {
  let cache: Cache | undefined;
  try { cache = await caches.open('aetheros-python-wheels-' + PYODIDE_VERSION); } catch {}
  const cached = await cache?.match(url);
  const response = cached ?? await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(20_000) });
  if (!response.ok || !response.body) throw new Error(`Python package download failed (${response.status})`);
  const copy = cached ? undefined : response.clone();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16 * 1024 * 1024) throw new Error('Python wheel exceeds 16 MiB');
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    void copy?.body?.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (await computeSha256(bytes) !== sha256) {
    await cache?.delete(url);
    void copy?.body?.cancel().catch(() => {});
    throw new Error('Python wheel checksum verification failed');
  }
  if (copy) {
    if (cache) await cache.put(url, copy).catch(() => {});
    else void copy.body?.cancel().catch(() => {});
  }
  return bytes.buffer;
}

export async function getPythonAssets(packages: string[] = []): Promise<Record<string, ArrayBuffer> | undefined> {
  if (packages.length > 3 || packages.some((name) => !supported.has(name))) {
    throw new Error('Choose up to three Pyodide packages: ' + [...supported].join(', '));
  }
  if (import.meta.env.MODE === 'test' && typeof document === 'undefined') {
    if (packages.length) throw new Error('Python wheel loading requires browser integration');
    return undefined;
  }
  loading ??= Promise.all(Object.entries(assets).map(async ([name, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not read Python runtime asset ${name} (${response.status})`);
    return [name, await response.arrayBuffer()] as const;
  })).then(Object.fromEntries).catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  const runtime = await loading;
  if (!packages.length) return runtime;
  const lock = JSON.parse(new TextDecoder().decode(runtime['pyodide-lock.json'])) as {
    packages: Record<string, { file_name: string; sha256: string; depends: string[] }>;
  };
  const loaded = await Promise.all([...new Set(packages)].map(async (name) => {
    const info = lock.packages[name];
    if (!info || info.depends.length || !/^[\w.-]+\.whl$/.test(info.file_name) || !/^[a-f0-9]{64}$/.test(info.sha256)) {
      throw new Error(`Unsupported Python package metadata: ${name}`);
    }
    const url = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/${info.file_name}`;
    let wheel = pendingWheels.get(url);
    if (!wheel) {
      wheel = readWheel(url, info.sha256).finally(() => pendingWheels.delete(url));
      pendingWheels.set(url, wheel);
    }
    return [info.file_name, await wheel] as const;
  }));
  return { ...runtime, ...Object.fromEntries(loaded) };
}
