import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const executable = process.env.MKCERT_PATH || (existsSync(join(root, '.artifacts/tools/mkcert.exe')) ? join(root, '.artifacts/tools/mkcert.exe') : 'mkcert');
const secrets = join(root, 'secrets'); mkdirSync(secrets, { recursive: true });
function mkcert(args, options = {}) {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error('mkcert failed. Install mkcert, then rerun npm run env:web:https.');
  return result;
}
// Installing local CA trust may require an operating-system confirmation.
if (!existsSync(join(secrets, 'localhost.pem')) || !existsSync(join(secrets, 'localhost-key.pem'))) {
  mkcert(['-cert-file', join(secrets, 'localhost.pem'), '-key-file', join(secrets, 'localhost-key.pem'), 'localhost', '127.0.0.1', '::1'], { stdio: 'inherit' });
}
const caRoot = mkcert(['-CAROOT']).stdout.trim();
copyFileSync(join(caRoot, 'rootCA.pem'), join(secrets, 'rootCA.pem'));
mkcert(['-install'], { stdio: 'inherit' });
console.log('HTTPS ready. Certificates and private keys remain in ignored secrets/.');
