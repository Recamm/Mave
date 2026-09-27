import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { defineConfig, type Plugin } from 'vite';

function serviceWorkerPlugin(): Plugin {
  const sourcePath = new URL('./src/service-worker.ts', import.meta.url);

  async function compileServiceWorker() {
    const source = await readFile(sourcePath, 'utf8');
    return ts.transpile(source, {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    });
  }

  return {
    name: 'mave-service-worker',
    configureServer(server) {
      server.middlewares.use('/service-worker.js', (_request, response, next) => {
        void compileServiceWorker()
          .then((source) => {
            response.setHeader('Content-Type', 'text/javascript');
            response.end(source);
          })
          .catch(next);
      });
    },
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'service-worker.js',
        source: await compileServiceWorker(),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorkerPlugin()],
});
