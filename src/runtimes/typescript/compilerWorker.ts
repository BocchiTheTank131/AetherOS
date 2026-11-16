import { processCompilerRequest } from './compilerEngine';
import type { CompilerRequest } from './compilerClient';

self.addEventListener('message', async ({ data }: MessageEvent<{ id: number; request: CompilerRequest }>) => {
  try {
    self.postMessage({ id: data.id, result: await processCompilerRequest(data.request) });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
});
