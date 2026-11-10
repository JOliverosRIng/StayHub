import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serviceRoot, '../..');
const databaseUrlFile = process.env.PAYMENTS_DATABASE_URL_FILE?.trim();

if (!process.env.PAYMENTS_DATABASE_URL?.trim() && databaseUrlFile) {
  try {
    process.env.PAYMENTS_DATABASE_URL = readFileSync(databaseUrlFile, 'utf8').trim();
  } catch {
    process.stderr.write('PAYMENTS_DATABASE_URL_FILE could not be read.\n');
    process.exit(1);
  }
}

if (!process.env.PAYMENTS_DATABASE_URL?.trim()) {
  process.stderr.write('PAYMENTS_DATABASE_URL or PAYMENTS_DATABASE_URL_FILE is required.\n');
  process.exit(1);
}

const prismaCli = path.join(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
  cwd: serviceRoot,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
