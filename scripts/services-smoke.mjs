import assert from 'node:assert/strict';
import { createSign, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const userId = randomUUID();
function token(service, access = false, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'local-dev' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: `stayhub-local-${service}`, aud: `stayhub-${service}-${access ? 'access' : 'service'}`, sub: access ? userId : 'local-smoke', iat: now, exp: now + 240, ...(access ? { roles: ['GUEST'] } : { scope }) })).toString('base64url');
  const content = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(content);
  return `${content}.${signer.sign(readFileSync(new URL(`../.artifacts/services/${service}-private.pem`, import.meta.url)), 'base64url')}`;
}
async function request(port, route, options = {}, status = 200) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { ...options, signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, status, `${port}${route}: unexpected HTTP status`);
  return response.json();
}
async function ready(port) {
  for (let i = 0; i < 60; i++) {
    try { return await request(port, '/health/ready'); } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  throw new Error(`Service on ${port} did not become ready`);
}
const headers = (service, scope, key = randomUUID()) => ({ authorization: `Bearer ${token(service, false, scope)}`, 'content-type': 'application/json', 'idempotency-key': key });
function compose(...args) {
  const result = spawnSync('docker', ['compose', '-f', 'docker-compose.services.yml', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `Docker ${args[0]} failed`);
  return result.stdout.trim();
}

await ready(3006);
await ready(3009);
const paymentHeaders = headers('payments', 'payments:charge');
const paymentBody = JSON.stringify({ bookingId: randomUUID(), payerUserId: userId, amountMinor: 125000, currency: 'COP', paymentMethod: { type: 'CARD_TOKEN', token: 'tok_approved' } });
const payment = await request(3006, '/payments', { method: 'POST', headers: paymentHeaders, body: paymentBody }, 201);
assert.equal(payment.status, 'APPROVED');
const replay = await request(3006, '/payments', { method: 'POST', headers: paymentHeaders, body: paymentBody }, 201);
assert.equal(replay.id, payment.id);
const refund = await request(3006, `/payments/${payment.id}/refund`, { method: 'POST', headers: headers('payments', 'payments:refund'), body: JSON.stringify({ reason: 'GUEST_CANCELLATION', amountMinor: 25000 }) }, 201);
assert.equal(refund.status, 'COMPLETED');

await request(3009, '/notifications/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, 401);
const notificationHeaders = headers('notifications', 'notifications:send');
const notificationBody = JSON.stringify({ userId, type: 'SYSTEM_ALERT', channel: 'IN_APP', templateData: { alertCode: 'SMOKE_TEST', title: 'Local verification', message: 'Persistent notification' } });
const notification = await request(3009, '/notifications/send', { method: 'POST', headers: notificationHeaders, body: notificationBody }, 201);
assert.equal(notification.status, 'SENT');
const notificationReplay = await request(3009, '/notifications/send', { method: 'POST', headers: notificationHeaders, body: notificationBody });
assert.equal(notificationReplay.id, notification.id);
const list = () => request(3009, `/notifications/user/${userId}`, { headers: { authorization: `Bearer ${token('notifications', true)}` } });
assert.ok((await list()).items.some(item => item.id === notification.id));
// Restart both database and app containers to verify persisted data, not process memory.
compose('restart', 'payments-db', 'notifications-db', 'payments-service', 'notifications-service');
await ready(3006);
await ready(3009);
const persisted = await request(3006, `/payments/${payment.id}/status`, { headers: headers('payments', 'payments:read') });
assert.equal(persisted.id ?? persisted.paymentId, payment.id);
assert.ok((await list()).items.some(item => item.id === notification.id));
assert.equal(compose('exec', '-T', 'payments-db', 'psql', '-U', 'stayhub_payments', '-d', 'payments_db', '-tAc', `SELECT count(*) FROM payments WHERE id = '${payment.id}'`), '1');
assert.equal(compose('exec', '-T', 'notifications-db', 'psql', '-U', 'stayhub_notifications', '-d', 'notifications_db', '-tAc', `SELECT count(*) FROM "Notification" WHERE id = '${notification.id}'`), '1');
console.log('PASS: payment, refund, idempotency, notification, authorization, reads and persistence after database/service restart.');
