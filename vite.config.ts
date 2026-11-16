import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  worker: { format: 'es' },
  resolve: { alias: [{ find: /^buffer$/, replacement: 'buffer/index.js' }] },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'aetheros-offline-shell',
      apply: 'build',
      async writeBundle({ dir }) {
        if (!dir) return;
        const paths = (await readdir(dir, { recursive: true, withFileTypes: true }))
          .filter((file) => file.isFile() && file.name !== 'sw.js')
          .map((file) => join(file.parentPath, file.name).slice(dir.length + 1).replaceAll('\\', '/'))
          .sort();
        const template = await readFile('public/sw.js', 'utf8');
        const hash = createHash('sha256').update(template);
        for (const path of paths) hash.update(path).update(await readFile(join(dir, path)));
        const runtime = paths.filter((path) => /^assets\/(?:pyodide|python_stdlib|compilerWorker|compilerBundle|esbuild-)/.test(path));
        await writeFile(join(dir, 'sw.js'), template
          .replace('__BUILD_ID__', hash.digest('hex').slice(0, 16))
          .replace('__RUNTIME_ASSETS__', JSON.stringify(runtime))
          .replace('__PRECACHE_ASSETS__', JSON.stringify(paths.filter((path) => !runtime.includes(path)))));
      },
    },
  ],
});
