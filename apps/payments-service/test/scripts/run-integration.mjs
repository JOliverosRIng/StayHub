import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = path.resolve(serviceRoot, '../..');
const containerName = `stayhub-payments-test-${randomBytes(5).toString('hex')}`;
const rabbitContainerName = `stayhub-payments-rabbit-test-${randomBytes(5).toString('hex')}`;
const username = 'payments_test';
const password = randomBytes(18).toString('hex');
const database = 'payments_test';
const require = createRequire(import.meta.url);
const amqp = require('amqplib');
const projectFlagIndex = process.argv.indexOf('--project');
const project = projectFlagIndex >= 0 ? process.argv[projectFlagIndex + 1] : 'integration';
if (!['integration', 'performance', 'all'].includes(project)) throw new Error('Supported projects: integration, performance, all');
const jestArguments = process.argv.slice(2).filter((argument, index, arguments_) =>
  argument !== '--project' && arguments_[index - 1] !== '--project',
);
const useRabbit = project === 'integration' || project === 'all';
const selectedProjects = project === 'all' ? ['unit', 'integration', 'contract', 'security', 'performance'] : [project];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: serviceRoot, encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${String(result.status)}`);
  return result.stdout?.trim() ?? '';
}

function runCaptured(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: serviceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  return { output, status: result.status };
}

function assertNoSensitiveLogs(logs) {
  const patterns = [
    /\bBearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/-]+=*/i,
    /\btok_[A-Za-z0-9_-]{4,}\b/,
    /(?<!\d)\d{13,19}(?!\d)/,
    /\bAuthorization\b["']?\s*[:=]\s*["']?(?!["']?\[REDACTED\])[^,\s}\]]+/i,
    /\b(?:Idempotency-Key|idempotencyKey)\b["']?\s*[:=]\s*["']?(?!["']?\[REDACTED\])(?:[0-9a-f-]{16,}|[^,\s}\]]+)/i,
  ];
  // Jest's combined output also contains coverage tables and test fixture text,
  // which can contain PAN-shaped numbers unrelated to emitted application logs.
  // Scan only structured Payments service log records captured from the suites.
  const serviceLogs = logs
    .split(/\r?\n/)
    .filter((line) => line.includes('"service":"payments-service"'))
    .join('\n');
  const findingIndex = patterns.findIndex((pattern) => pattern.test(serviceLogs));
  if (findingIndex >= 0) throw new Error(`Sensitive value pattern ${findingIndex + 1} detected in captured Payments integration logs`);
}

function runDocker(args, options = {}) {
  return run('docker', args, options);
}

async function amqpReady(url) {
  try {
    const connection = await amqp.connect(url, { timeout: 1_000 });
    await connection.close();
    return true;
  } catch {
    return false;
  }
}

try {
  runDocker([
    'run', '--rm', '--detach', '--name', containerName,
    '--env', `POSTGRES_USER=${username}`,
    '--env', `POSTGRES_PASSWORD=${password}`,
    '--env', `POSTGRES_DB=${database}`,
    '--publish', '127.0.0.1::5432',
    'postgres:16-alpine',
  ]);
  if (useRabbit) {
    runDocker([
      'run', '--rm', '--detach', '--name', rabbitContainerName,
      '--publish', '127.0.0.1::5672',
      'rabbitmq:3.13-alpine',
    ]);
  }

  let ready = false;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const probe = spawnSync('docker', ['exec', containerName, 'pg_isready', '-U', username, '-d', database], {
      cwd: serviceRoot,
      stdio: 'ignore',
    });
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!ready) throw new Error('Temporary PostgreSQL 16 did not become ready');

  const mapping = runDocker(['port', containerName, '5432/tcp'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const match = mapping.match(/127\.0\.0\.1:(\d+)/);
  if (!match) throw new Error('Could not resolve the temporary PostgreSQL port');
  const databaseUrl = `postgresql://${username}:${password}@127.0.0.1:${match[1]}/${database}?schema=public`;
  let rabbitUrl;
  if (useRabbit) {
    const rabbitMapping = runDocker(['port', rabbitContainerName, '5672/tcp'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const rabbitMatch = rabbitMapping.match(/127\.0\.0\.1:(\d+)/);
    if (!rabbitMatch) throw new Error('Could not resolve the temporary RabbitMQ port');
    let rabbitReady = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await amqpReady(`amqp://127.0.0.1:${rabbitMatch[1]}`)) {
        rabbitReady = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!rabbitReady) throw new Error('Temporary RabbitMQ did not accept an AMQP handshake');
    rabbitUrl = `amqp://127.0.0.1:${rabbitMatch[1]}`;
  }
  const environment = {
    ...process.env,
    PAYMENTS_DATABASE_URL: databaseUrl,
    PAYMENTS_TEST_DATABASE_URL: databaseUrl,
    ...(rabbitUrl ? { PAYMENTS_TEST_RABBITMQ_URL: rabbitUrl } : {}),
  };

  run(process.execPath, [path.join(repositoryRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { env: environment });
  const testResult = runCaptured(process.execPath, [path.join(repositoryRoot, 'node_modules/jest/bin/jest.js'), '--selectProjects', ...selectedProjects, '--runInBand', ...jestArguments], { env: environment });
  if (project === 'integration' || project === 'all') assertNoSensitiveLogs(testResult.output);
  if (testResult.status !== 0) throw new Error(`Jest ${project} project exited with code ${String(testResult.status)}`);
} finally {
  const stopped = spawnSync('docker', ['stop', containerName], { cwd: serviceRoot, stdio: 'ignore' });
  if (stopped.error && stopped.error.code !== 'ENOENT') throw stopped.error;
  if (useRabbit) {
    const rabbitStopped = spawnSync('docker', ['stop', rabbitContainerName], { cwd: serviceRoot, stdio: 'ignore' });
    if (rabbitStopped.error && rabbitStopped.error.code !== 'ENOENT') throw rabbitStopped.error;
  }
}
