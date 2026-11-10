import { createSign, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [service, operation = 'charge'] = process.argv.slice(2);
const operations = service === 'payments' ? ['charge', 'refund', 'read'] : service === 'notifications' ? ['send', 'read'] : [];
if (!operations.includes(operation)) {
  console.error('Uso: npm run token:services -- payments charge|refund|read\n     npm run token:services -- notifications send|read [userId]');
  process.exit(1);
}
const access = service === 'notifications' && operation === 'read';
const userId = process.argv[4] || randomUUID();
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'local-dev' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({
  iss: `stayhub-local-${service}`, aud: `stayhub-${service}-${access ? 'access' : 'service'}`,
  sub: access ? userId : 'local-manual-test', iat: now, exp: now + (access ? 3600 : 300),
  ...(access ? { roles: ['GUEST'] } : { scope: `${service}:${operation}` }),
})).toString('base64url');
const content = `${header}.${payload}`;
const signer = createSign('RSA-SHA256');
signer.update(content);
const key = readFileSync(new URL(`../.artifacts/services/${service}-private.pem`, import.meta.url));
console.log(`${content}.${signer.sign(key, 'base64url')}`);
