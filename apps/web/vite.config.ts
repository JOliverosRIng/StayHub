import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Agent } from 'node:https';
export default defineConfig(({ command, mode }) => {
  const root = resolve(__dirname, '../..');
  const env = { ...loadEnv(mode, root, ''), ...process.env };
  const tls = command === 'serve' ? {
    cert: readFileSync(resolve(root, env.WEB_TLS_CERT_FILE || 'secrets/localhost.pem')),
    key: readFileSync(resolve(root, env.WEB_TLS_KEY_FILE || 'secrets/localhost-key.pem')),
  } : undefined;
  return {
    plugins: [react(), tailwindcss()], resolve: { alias: { '@': resolve(__dirname, './src') } },
    server: { host: 'localhost', port: 5173, strictPort: true, https: tls,
      proxy: { '/api': { target: env.WEB_GATEWAY_URL || 'https://localhost:8080', secure: true, changeOrigin: true,
        agent: tls ? new Agent({ ca: readFileSync(resolve(root, env.WEB_TLS_CA_FILE || 'secrets/rootCA.pem')) }) : undefined } },
    },
  };
});
