import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import { parse } from 'yaml';

const CONTRACT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../specs/002-alojamientos/contracts/openapi-accommodations-service.yaml');
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const EXPECTED = [
  { path: '/properties', method: 'post', operationId: 'createProperty', statuses: [201, 400, 401, 403, 503] },
  { path: '/properties/{id}', method: 'get', operationId: 'getProperty', statuses: [200, 400, 401, 404, 503] },
  { path: '/properties/{id}', method: 'put', operationId: 'replaceProperty', statuses: [200, 400, 401, 403, 404, 409, 503] },
  { path: '/properties/{id}/photos', method: 'post', operationId: 'addPropertyPhoto', statuses: [201, 400, 401, 403, 404, 409, 413, 415, 503] },
];
const SECRET_RULES = [
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'JWT', pattern: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { name: 'embedded credentials', pattern: /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@/i },
];

function operationsOf(document) {
  return Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
    Object.keys(item).filter((key) => HTTP_METHODS.has(key)).map((method) => {
      const operation = item[method];
      return { path, method, operationId: operation.operationId, statuses: Object.keys(operation.responses ?? {}).map(Number).sort((a, b) => a - b) };
    }));
}

function problemsOf(document, raw) {
  const problems = [];
  if (typeof document?.openapi !== 'string' || !document.openapi.startsWith('3.')) problems.push('missing OpenAPI 3.x version');
  const actual = operationsOf(document).sort((a, b) => a.operationId.localeCompare(b.operationId));
  const expected = EXPECTED.map((item) => ({ ...item, statuses: [...item.statuses].sort((a, b) => a - b) })).sort((a, b) => a.operationId.localeCompare(b.operationId));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    problems.push(`operations drifted: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
  for (const { name, pattern } of SECRET_RULES) {
    if (pattern.test(raw)) problems.push(`contract contains ${name}`);
  }
  if (raw.includes('storageKey') || raw.includes('photoStorageRoot')) problems.push('contract leaks storage internals');
  return problems;
}

const raw = await readFile(CONTRACT, 'utf8');
await SwaggerParser.validate(CONTRACT);
const problems = problemsOf(parse(raw), raw);
if (problems.length > 0) {
  process.stderr.write(`Accommodations OpenAPI drift detected:\n- ${problems.join('\n- ')}\n`);
  process.exit(1);
}
process.stdout.write('Accommodations OpenAPI is valid, matches the four v1 operations and carries no secrets\n');
