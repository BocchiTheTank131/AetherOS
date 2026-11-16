import { Worker as Thread } from 'node:worker_threads';
import { resolveObjectURL } from 'node:buffer';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

class TestWorker {
  private thread: Thread | undefined;
  private terminated = false;
  private pending: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((error: Error) => void) | null = null;

  constructor(url: string) {
    const blob = resolveObjectURL(url);
    if (!blob) throw new Error('Invalid worker Blob URL');
    void blob.text().then((source) => {
      if (this.terminated) return;
      this.thread = new Thread(`
        const { parentPort } = require('node:worker_threads');
        globalThis.self = globalThis;
        globalThis.postMessage = (data) => parentPort.postMessage(data);
        let receive;
        parentPort.on('message', (data) => receive?.({ data, isTrusted: true }));
        globalThis.addEventListener = (type, listener) => {
          if (type === 'message') receive = listener;
        };
        globalThis.importScripts = () => {
          const { loadPyodide } = require(${JSON.stringify(require.resolve('pyodide'))});
          globalThis.loadPyodide = ({ indexURL, ...options }) => loadPyodide(options);
        };
        ${source}
      `, { eval: true });
      this.thread.on('message', (data) => this.onmessage?.({ data }));
      this.thread.on('error', (error) => this.onerror?.(error));
      for (const data of this.pending) this.thread.postMessage(data);
      this.pending = [];
    });
  }

  postMessage(data: unknown): void {
    if (this.thread) this.thread.postMessage(data);
    else this.pending.push(data);
  }

  terminate(): void {
    this.terminated = true;
    void this.thread?.terminate();
  }
}

Object.defineProperty(globalThis, 'Worker', { value: TestWorker, writable: true, configurable: true });
