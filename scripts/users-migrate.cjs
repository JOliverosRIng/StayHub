const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const env = { ...process.env };
if (env.USERS_DATABASE_URL_FILE) env.USERS_DATABASE_URL = readFileSync(env.USERS_DATABASE_URL_FILE, 'utf8').trim();
const url = new URL(env.USERS_DATABASE_URL);
if (url.pathname !== '/users_db') throw new Error('Users migrations require users_db');
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/users-service/prisma/schema.prisma'], { env, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
