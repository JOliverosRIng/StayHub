#!/usr/bin/env node
// Genera `.env` y los secretos de desarrollo compartidos por Auth y Users.
//
// Idempotente: si `.env` ya existe, lo valida y reutiliza sin sobrescribir ni
// rotar claves. No imprime valores secretos. Para regenerar desde cero hay que
// eliminar `.env` y el directorio `secrets/`.
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { DevEnvConflictError, ensureDevEnvironment, SECRET_FILES } from './lib/dev-env.mjs';

function parseArgs(argv) {
  const parsed = { root: undefined, example: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--root') parsed.root = argv[(index += 1)];
    else if (flag === '--example') parsed.example = argv[(index += 1)];
    else if (flag === '--help' || flag === '-h') parsed.help = true;
  }
  return parsed;
}

function printHelp() {
  console.log(`Uso: node scripts/generate-auth-dev-env.mjs [opciones]

Genera .env y secrets/ para el desarrollo local compartido de Auth y Users.
Si .env ya existe, se valida y reutiliza (no se rota ninguna clave).

Opciones:
  --root <dir>      Directorio destino (por defecto la raíz del repositorio)
  --example <file>  Plantilla .env.example (por defecto <root>/.env.example)
  -h, --help        Esta ayuda
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const defaultRoot = fileURLToPath(new URL('..', import.meta.url));
  const root = options.root ?? defaultRoot;
  const examplePath = options.example ?? join(root, '.env.example');

  try {
    const result = ensureDevEnvironment({ root, examplePath });
    if (result.reused) {
      console.log('[auth-env] .env existente validado y reutilizado; no se rotaron claves.');
    } else {
      console.log('[auth-env] .env y secretos de desarrollo generados con claves RSA locales.');
    }
    console.log(`[auth-env] .env: ${result.envPath}`);
    console.log(`[auth-env] secretos: ${result.secretsDir}`);
    for (const [name, file] of Object.entries(SECRET_FILES)) {
      console.log(`[auth-env]   ${name}: ${result.files[name] ?? join(result.secretsDir, file)}`);
    }
  } catch (error) {
    if (error instanceof DevEnvConflictError) {
      console.error(`[auth-env] conflicto: ${error.message}`);
      console.error('[auth-env] no se modificó ningún archivo.');
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main();
