import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const privateKey = readFileSync(resolve(root, '.artifacts/search/service-private.pem'), 'utf8');
const encode = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'search-dev-1' })}.${encode({
  iss: 'stayhub-search-dev-client',
  aud: 'stayhub-search-service',
  scope: 'search:invoke',
  sub: 'local-developer',
  iat: now,
  exp: now + 3600,
})}`;
const signature = createSign('RSA-SHA256').update(unsigned).end().sign(privateKey).toString('base64url');
process.stdout.write(`${unsigned}.${signature}\n`);
