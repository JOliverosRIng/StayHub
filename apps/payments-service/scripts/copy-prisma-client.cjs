const { cpSync, existsSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');

const source = resolve(__dirname, '../src/infrastructure/persistence/generated/client');
const destination = resolve(__dirname, '../../../dist/apps/payments-service/infrastructure/persistence/generated/client');

if (!existsSync(source)) {
  throw new Error('Payments Prisma client is missing; run prisma:payments:generate before build');
}

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, force: true });
