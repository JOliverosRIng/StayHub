import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = path.resolve(serviceRoot, '../..');
const containerName = `stayhub-payments-test-${randomBytes(5).toString('hex')}`;
const username = 'payments_test';
const password = randomBytes(18).toString('hex');
const database = 'payments_test';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: serviceRoot, encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${String(result.status)}`);
  return result.stdout?.trim() ?? '';
}

function runDocker(args, options = {}) {
  return run('docker', args, options);
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
  const environment = {
    ...process.env,
    PAYMENTS_DATABASE_URL: databaseUrl,
    PAYMENTS_TEST_DATABASE_URL: databaseUrl,
  };

  run(process.execPath, [path.join(repositoryRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { env: environment });
  run(process.execPath, [path.join(repositoryRoot, 'node_modules/jest/bin/jest.js'), '--selectProjects', 'integration', '--runInBand', ...process.argv.slice(2)], { env: environment });
} finally {
  const stopped = spawnSync('docker', ['stop', containerName], { cwd: serviceRoot, stdio: 'ignore' });
  if (stopped.error && stopped.error.code !== 'ENOENT') throw stopped.error;
}
