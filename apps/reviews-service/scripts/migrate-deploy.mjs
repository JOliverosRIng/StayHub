import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serviceRoot, '../..');
const env = { ...process.env };
const databaseUrlFile = env.REVIEWS_DATABASE_URL_FILE?.trim();

if (!env.REVIEWS_DATABASE_URL?.trim() && databaseUrlFile) {
  try {
    env.REVIEWS_DATABASE_URL = readFileSync(databaseUrlFile, 'utf8').trim();
  } catch {
    process.stderr.write('REVIEWS_DATABASE_URL_FILE could not be read.\n');
    process.exit(1);
  }
}

if (!env.REVIEWS_DATABASE_URL?.trim()) {
  process.stderr.write('REVIEWS_DATABASE_URL or REVIEWS_DATABASE_URL_FILE is required.\n');
  process.exit(1);
}

const databaseUrl = new URL(env.REVIEWS_DATABASE_URL);
if (databaseUrl.pathname !== '/reviews_db') {
  process.stderr.write('Reviews migrations require the reviews_db database.\n');
  process.exit(1);
}

const prismaCli = path.join(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(
  process.execPath,
  [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  { cwd: serviceRoot, env, stdio: 'inherit' },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
