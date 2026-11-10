import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const env = { ...process.env };
if (env.NOTIFICATIONS_DATABASE_URL_FILE) {
  env.NOTIFICATIONS_DATABASE_URL = readFileSync(env.NOTIFICATIONS_DATABASE_URL_FILE, 'utf8').trim();
}
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
