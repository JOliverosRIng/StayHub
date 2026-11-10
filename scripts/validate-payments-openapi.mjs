import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceRoot = path.join(repositoryRoot, 'apps', 'payments-service');
const requireFromPayments = createRequire(path.join(serviceRoot, 'package.json'));
const { parse } = requireFromPayments('yaml');
const Ajv2020 = requireFromPayments('ajv/dist/2020').default;
const addFormats = requireFromPayments('ajv-formats').default;

const openApiPath = path.join(
  repositoryRoot,
  'specs',
  '003-reservas-pagos-resenas',
  'payments_service',
  'contracts',
  'openapi-payments-service.yaml',
);
const eventSchemaPath = path.join(
  repositoryRoot,
  'specs',
  '003-reservas-pagos-resenas',
  'payments_service',
  'contracts',
  'payment-events-v1.schema.json',
);

const openApi = parse(readFileSync(openApiPath, 'utf8'));
if (openApi.openapi !== '3.1.0') {
  throw new Error(`Payments OpenAPI must use version 3.1.0; found ${String(openApi.openapi)}`);
}

for (const [route, method] of [
  ['/payments', 'post'],
  ['/payments/{id}/refund', 'post'],
  ['/payments/{id}/status', 'get'],
]) {
  if (!openApi.paths?.[route]?.[method]) {
    throw new Error(`Payments OpenAPI is missing ${method.toUpperCase()} ${route}`);
  }
}

const eventSchema = JSON.parse(readFileSync(eventSchemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.compile(eventSchema);

const jestCli = path.join(repositoryRoot, 'node_modules', 'jest', 'bin', 'jest.js');
for (const [project, testPath] of [
  ['contract', 'test/contract/openapi-drift.spec.ts'],
  ['unit', 'test/unit/payment-events.spec.ts'],
]) {
  const result = spawnSync(process.execPath, [
    jestCli,
    '--selectProjects', project,
    '--runInBand',
    '--runTestsByPath',
    testPath,
  ], { cwd: serviceRoot, stdio: 'inherit' });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write('Payments OpenAPI 3.1.0 and event JSON Schema validation passed.\n');
