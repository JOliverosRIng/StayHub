import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
export default defineConfig(({ mode }) => {
  const root = resolve(__dirname, '../..');
  const env = { ...loadEnv(mode, root, ''), ...process.env };
  return {
    plugins: [react(), tailwindcss()], resolve: { alias: { '@': resolve(__dirname, './src') } },
    server: { host: 'localhost', port: 5173, strictPort: true,
      proxy: { '/api': { target: env.WEB_GATEWAY_URL || 'http://127.0.0.1:8080', changeOrigin: true } },
    },
  };
});
