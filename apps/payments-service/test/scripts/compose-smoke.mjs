import { createSign, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = path.resolve(serviceRoot, '../..');
const artifactsRoot = path.join(repositoryRoot, '.artifacts');
mkdirSync(artifactsRoot, { recursive: true });
const tempRoot = mkdtempSync(path.join(artifactsRoot, 'payments-compose-smoke-'));
const project = `payments-smoke-${randomBytes(5).toString('hex')}`;
const composeFile = path.join(repositoryRoot, 'docker-compose.yml');
const composeArgs = ['compose', '-p', project, '--env-file', path.join(tempRoot, 'compose.env'), '-f', composeFile];
const dbPassword = randomBytes(24).toString('base64url');
const serviceKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const userKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function writeSecret(name, value) {
  const file = path.join(tempRoot, name);
  writeFileSync(file, value, { mode: 0o600 });
  return file.replaceAll('\\', '/');
}

function run(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const safeOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`
      .split(/\r?\n/)
      .filter((line) => !/eyJ[A-Za-z0-9_-]{10,}/.test(line))
      .join('\n');
    throw new Error(`docker command failed (${result.status}): ${safeOutput.slice(-1200)}`);
  }
  return (result.stdout ?? '').trim();
}

function compose(args, options) {
  return run([...composeArgs, ...args], options);
}

function signServiceToken(scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'payments-smoke-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'stayhub-payments-smoke',
    aud: 'stayhub-payments-service',
    sub: 'payments-compose-smoke',
    scope,
    iat: now,
    exp: now + 240,
  })).toString('base64url');
  const content = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(content);
  signer.end();
  return `${content}.${signer.sign(serviceKeys.privateKey, 'base64url')}`;
}

function envLine(name, value) {
  return `${name}=${String(value).replaceAll('\\', '/').replaceAll('\n', '')}`;
}

try {
  const files = {
    AUTH_DB_PASSWORD_FILE: writeSecret('auth-db-password', 'smoke'),
    USERS_DB_PASSWORD_FILE: writeSecret('users-db-password', 'smoke'),
    USERS_DATABASE_URL_FILE: writeSecret('users-database-url', 'postgresql://smoke:smoke@users-db:5432/users_db'),
    USERS_JWT_PUBLIC_KEY_FILE: writeSecret('users-jwt-public.pem', userKeys.publicKey),
    USERS_SERVICE_JWT_PUBLIC_KEY_FILE: writeSecret('users-service-jwt-public.pem', userKeys.publicKey),
    PAYMENTS_DB_PASSWORD_FILE: writeSecret('payments-db-password', dbPassword),
    PAYMENTS_DATABASE_URL_FILE: writeSecret('payments-database-url', `postgresql://stayhub_payments:${dbPassword}@payments-db:5432/payments_db?schema=public`),
    PAYMENTS_JWT_PUBLIC_KEY_FILE: writeSecret('payments-jwt-public.pem', userKeys.publicKey),
    PAYMENTS_SERVICE_JWT_PUBLIC_KEY_FILE: writeSecret('payments-service-jwt-public.pem', serviceKeys.publicKey),
    PAYMENTS_TOKEN_HMAC_SECRET_FILE: writeSecret('payments-token-hmac', randomBytes(48).toString('hex')),
    GATEWAY_TLS_CERT_SOURCE: writeSecret('gateway-tls-cert.pem', 'test'),
    GATEWAY_TLS_KEY_SOURCE: writeSecret('gateway-tls-key.pem', 'test'),
    GATEWAY_REDIS_PASSWORD_SOURCE: writeSecret('gateway-redis-password', 'test'),
    GATEWAY_SERVICE_PRIVATE_KEY_SOURCE: writeSecret('gateway-service-private.pem', 'test'),
  };
  const variables = {
    ...files,
    USERS_JWT_ISSUER: 'stayhub-users-smoke',
    USERS_JWT_AUDIENCE: 'stayhub-users-smoke',
    USERS_JWT_KID: 'users-smoke-key',
    USERS_SERVICE_JWT_ISSUER: 'stayhub-users-smoke',
    USERS_SERVICE_JWT_AUDIENCE: 'stayhub-users-smoke',
    USERS_SERVICE_JWT_KID: 'users-smoke-key',
    SEARCH_DATABASE_URL: 'postgresql://smoke:smoke@search-db:5432/search_db',
    SEARCH_DB_PASSWORD: 'smoke',
    SEARCH_RABBITMQ_PASSWORD: 'smoke',
    SEARCH_RABBITMQ_URL: 'amqp://smoke:smoke@rabbitmq:5672/search',
    SEARCH_REDIS_PASSWORD: 'smoke',
    SEARCH_REDIS_URL: 'redis://:smoke@search-redis:6379/0',
    SEARCH_SERVICE_JWT_ISSUER: 'stayhub-search-smoke',
    SEARCH_SERVICE_JWT_AUDIENCE: 'stayhub-search-smoke',
    SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ 'smoke-key': userKeys.publicKey }),
    PAYMENTS_JWT_ISSUER: 'stayhub-payments-smoke',
    PAYMENTS_JWT_AUDIENCE: 'stayhub-payments-service',
    PAYMENTS_JWT_KID: 'payments-user-smoke-key',
    PAYMENTS_SERVICE_JWT_ISSUER: 'stayhub-payments-smoke',
    PAYMENTS_SERVICE_JWT_AUDIENCE: 'stayhub-payments-service',
    PAYMENTS_SERVICE_JWT_KID: 'payments-smoke-key',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
  };
  writeFileSync(path.join(tempRoot, 'compose.env'), Object.entries(variables).map(([key, value]) => envLine(key, value)).join(os.EOL));

  compose(['up', '-d', 'payments-db', 'payments-migrate'], { stdio: 'inherit' });
  compose(['up', '-d', '--build', '--no-deps', 'payments-service'], { stdio: 'inherit' });

  const readinessScript = `fetch('http://127.0.0.1:3006/health/ready').then(async r=>console.log(JSON.stringify({httpStatus:r.status,body:await r.json()}))).catch(()=>process.exit(1))`;
  let readiness;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const probe = spawnSync('docker', [...composeArgs, 'exec', '-T', 'payments-service', 'node', '-e', readinessScript], { cwd: repositoryRoot, encoding: 'utf8' });
    const record = probe.status === 0 ? probe.stdout.split(/\r?\n/).filter(Boolean).at(-1) : undefined;
    try {
      readiness = record ? JSON.parse(record) : undefined;
    } catch {
      readiness = undefined;
    }
    if (readiness?.httpStatus === 200 && readiness.body.status === 'degraded'
      && readiness.body.checks.database === 'up' && readiness.body.checks.migration === 'applied'
      && readiness.body.checks.rabbitmq === 'degraded') break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!readiness || readiness.httpStatus !== 200 || readiness.body.status !== 'degraded'
    || readiness.body.checks.database !== 'up' || readiness.body.checks.migration !== 'applied'
    || readiness.body.checks.rabbitmq !== 'degraded') {
    throw new Error(`Payments Compose readiness did not reach the expected degraded state: ${JSON.stringify(readiness?.body?.checks ?? {})}`);
  }
  process.stdout.write(`Compose readiness: ${JSON.stringify(readiness.body)}${os.EOL}`);

  const idempotencyKey = randomUUID();
  const chargeToken = signServiceToken('payments:charge');
  const chargeScript = `fetch('http://127.0.0.1:3006/payments',{method:'POST',headers:{authorization:'Bearer '+process.env.SMOKE_JWT,'content-type':'application/json','idempotency-key':process.env.SMOKE_IDEMPOTENCY},body:JSON.stringify({bookingId:process.env.SMOKE_BOOKING,payerUserId:process.env.SMOKE_PAYER,amountMinor:125000,currency:'COP',paymentMethod:{type:'CARD_TOKEN',token:'tok_gateway_timeout'}})}).then(async r=>{const b=await r.json();if(r.status!==202||!b.id)process.exit(1);console.log(JSON.stringify({status:r.status,paymentId:b.id}));}).catch(()=>process.exit(1))`;
  const chargeOutput = compose(['exec', '-T', '-e', `SMOKE_JWT=${chargeToken}`, '-e', `SMOKE_IDEMPOTENCY=${idempotencyKey}`, '-e', `SMOKE_BOOKING=${randomUUID()}`, '-e', `SMOKE_PAYER=${randomUUID()}`, 'payments-service', 'node', '-e', chargeScript]);
  const payment = JSON.parse(chargeOutput.split(/\r?\n/).filter(Boolean).at(-1));
  if (!payment.paymentId || payment.status !== 202) throw new Error('Compose payment did not remain pending after the simulated gateway timeout');
  const ledgerBefore = Number(compose(['exec', '-T', 'payments-db', 'psql', '-U', 'stayhub_payments', '-d', 'payments_db', '-tAc', 'SELECT count(*) FROM mock_gateway_operations']))
    .toString();
  if (Number(ledgerBefore) < 1) throw new Error('PostgreSQL mock gateway ledger did not persist the operation');
  const paymentCountBefore = Number(compose(['exec', '-T', 'payments-db', 'psql', '-U', 'stayhub_payments', '-d', 'payments_db', '-tAc', `SELECT count(*) FROM payments WHERE id = '${payment.paymentId}'`]));
  if (paymentCountBefore !== 1) throw new Error('PostgreSQL did not persist the payment returned by POST /payments');

  const inspect = JSON.parse(run(['inspect', '--format', '{{json .HostConfig.RestartPolicy}}', `${project}-payments-service-1`]));
  if (inspect.Name !== 'always') throw new Error('Payments Compose restart policy is not always');
  const serviceContainer = `${project}-payments-service-1`;
  const killNodeScript = `const fs=require('node:fs');let found=false;for(const pid of fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x)&&Number(x)>1)){try{const argv=fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\\0');if(argv[0].split('/').at(-1)==='node'&&argv[1]==='dist/apps/payments-service/main.js'){found=true;process.kill(Number(pid),'SIGKILL');break}}catch{}}if(found)console.log('target terminated');else process.exit(2)`;
  const killResult = spawnSync('docker', [...composeArgs, 'exec', '-T', 'payments-service', 'node', '-e', killNodeScript], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (!`${killResult.stdout ?? ''}${killResult.stderr ?? ''}`.includes('target terminated')) {
    throw new Error('Could not find and terminate the Payments Node process for the restart test');
  }
  let restarted = false;
  let lastRestartCount = 'unknown';
  let lastProbeStatus = 'unknown';
  const postRestartReadinessScript = `fetch('http://127.0.0.1:3006/health/ready').then(async r=>{if(!r.ok)process.exit(1);const b=await r.json();if(b.checks.database!=='up'||b.checks.migration!=='applied')process.exit(1);console.log(JSON.stringify(b))}).catch(()=>process.exit(1))`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const restartCount = spawnSync('docker', ['inspect', '--format', '{{.RestartCount}}', serviceContainer], { cwd: repositoryRoot, encoding: 'utf8' });
    const probe = spawnSync('docker', [...composeArgs, 'exec', '-T', 'payments-service', 'node', '-e', postRestartReadinessScript], { cwd: repositoryRoot, encoding: 'utf8' });
    lastRestartCount = restartCount.stdout?.trim() ?? 'unavailable';
    lastProbeStatus = String(probe.status);
    if (restartCount.status === 0 && Number(restartCount.stdout) > 0 && probe.status === 0) { restarted = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!restarted) throw new Error(`Payments container did not automatically restart and return to ready after SIGKILL (restartCount=${lastRestartCount}, readinessProbeExit=${lastProbeStatus})`);
  const paymentCountAfter = Number(compose(['exec', '-T', 'payments-db', 'psql', '-U', 'stayhub_payments', '-d', 'payments_db', '-tAc', `SELECT count(*) FROM payments WHERE id = '${payment.paymentId}'`]));
  if (paymentCountAfter !== 1) throw new Error('Payment row did not persist through the automatic service restart');
  const ledgerAfter = Number(compose(['exec', '-T', 'payments-db', 'psql', '-U', 'stayhub_payments', '-d', 'payments_db', '-tAc', 'SELECT count(*) FROM mock_gateway_operations']));
  if (ledgerAfter !== Number(ledgerBefore)) throw new Error('Mock gateway ledger changed unexpectedly after the service restart');
  process.stdout.write(JSON.stringify({ readiness: 'degraded-with-db-ready', migration: 'applied', paymentRowsAfterRestart: paymentCountAfter, mockLedgerOperations: ledgerAfter, restartPolicy: 'always' }) + os.EOL);
} catch (error) {
  const status = spawnSync('docker', [...composeArgs, 'ps', '-a'], { cwd: repositoryRoot, encoding: 'utf8' });
  const logs = spawnSync('docker', [...composeArgs, 'logs', '--no-color', 'payments-service', 'payments-db', 'payments-migrate'], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  const safeLogs = `${logs.stdout ?? ''}${logs.stderr ?? ''}`
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/gi, 'postgresql://[REDACTED]@')
    .replace(/eyJ[A-Za-z0-9_-]{10,}/g, '[REDACTED]');
  process.stderr.write(`Compose smoke diagnostics:\n${status.stdout ?? ''}${safeLogs.slice(-5000)}\n`);
  throw error;
} finally {
  spawnSync('docker', [...composeArgs, 'down', '-v', '--remove-orphans'], { cwd: repositoryRoot, stdio: 'ignore' });
  rmSync(tempRoot, { recursive: true, force: true });
}
