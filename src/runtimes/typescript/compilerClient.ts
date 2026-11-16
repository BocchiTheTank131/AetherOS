import type { TSCompileOptions } from './types';

export type CompilerRequest =
  | { action: 'version' }
  | { action: 'transpile'; file: string; code: string }
  | {
    action: 'compile' | 'completions' | 'hover' | 'definition';
    root: string;
    files: Record<string, string>;
    options: TSCompileOptions;
    file?: string;
    line?: number;
    col?: number;
  };

let compiler: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

function stopCompiler(error: Error) {
  compiler?.terminate();
  compiler = undefined;
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}

export async function runCompiler<T>(request: CompilerRequest, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  if (import.meta.env.MODE === 'test' && typeof document === 'undefined') {
    const { processCompilerRequest } = await import('./compilerEngine');
    return await processCompilerRequest(request) as T;
  }

  if (!compiler) {
    compiler = new Worker(new URL('./compilerWorker.ts', import.meta.url), { type: 'module' });
    compiler.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.result);
    };
    compiler.onerror = (event) => stopCompiler(new Error(event.message || 'TypeScript worker failed'));
    compiler.onmessageerror = () => stopCompiler(new Error('TypeScript worker response could not be decoded'));
  }

  const id = ++nextId;
  const abort = () => {
    pending.get(id)?.reject(new Error('TypeScript request cancelled'));
    pending.delete(id);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: (value) => resolve(value as T), reject });
      compiler!.postMessage({ id, request });
    });
  } finally {
    signal?.removeEventListener('abort', abort);
    pending.delete(id);
  }
}
