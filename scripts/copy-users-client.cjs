const { cpSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
cpSync(resolve(root, 'apps/users-service/src/infrastructure/persistence/generated'), resolve(root, 'dist/apps/users-service/infrastructure/persistence/generated'), { recursive: true });
