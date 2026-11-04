const { cpSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
cpSync(resolve(root, 'src/infrastructure/persistence/generated'), resolve(root, 'dist/infrastructure/persistence/generated'), { recursive: true });
