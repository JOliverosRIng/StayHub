import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/** `public/mockServiceWorker.js` exists for `vite dev` contract mocks only; keep it out of production output. */
function excludeMockWorker(): Plugin {
  let outDir = '';
  return {
    name: 'stayhub:exclude-mock-worker',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() { rmSync(resolve(outDir, 'mockServiceWorker.js'), { force: true }); },
  };
}

/**
 * Production bundles must know the public Gateway URL. A relative path (same origin) or https:// is
 * accepted; plain http:// is rejected because TLS is mandatory outside development.
 */
export function assertProductionApiBaseUrl(value: string | undefined): void {
  const url = value?.trim();
  if (!url) {
    throw new Error('[stayhub/web] VITE_API_BASE_URL es obligatoria para el build de producción '
      + '(p. ej. /api/v1 o https://api.stayhub.example/api/v1). Ver apps/web/.env.example.');
  }
  if (!url.startsWith('/') && !url.startsWith('https://')) {
    throw new Error('[stayhub/web] VITE_API_BASE_URL debe ser una ruta relativa o una URL https:// en producción.');
  }
}

export default defineConfig(({ command, mode }) => {
  const root = resolve(__dirname, '../..');
  // Server-only settings (WEB_GATEWAY_URL) come from the repository root .env, needed only by the
  // dev/preview proxy. Builds must not read it: its NODE_ENV=development (for the services) would
  // make Vite emit a development React bundle.
  const env = command === 'serve' ? { ...loadEnv(mode, root, ''), ...process.env } : process.env;
  // Public VITE_* settings come from apps/web/.env* (Vite's default envDir) or the process.
  const publicEnv = { ...loadEnv(mode, __dirname, 'VITE_'), ...process.env };
  if (command === 'build' && mode === 'production') assertProductionApiBaseUrl(publicEnv.VITE_API_BASE_URL);
  return {
    plugins: [react(), tailwindcss(), excludeMockWorker()], resolve: { alias: { '@': resolve(__dirname, './src') } },
    server: { host: 'localhost', port: 5173, strictPort: true,
      proxy: { '/api': { target: env.WEB_GATEWAY_URL || 'http://127.0.0.1:8080', changeOrigin: true } },
    },
    preview: { host: 'localhost', port: 4173, strictPort: true },
  };
});
