import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const contractPath = new URL(
  '../specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml',
  import.meta.url,
);
const document = parse(await readFile(contractPath, 'utf8'));

if (document?.openapi !== '3.0.3' || typeof document.paths !== 'object') {
  throw new Error('Auth OpenAPI must be a valid OpenAPI 3.0.3 document');
}

const requiredOperations = [
  ['/internal/v1/registrations', 'post'],
  ['/internal/v1/login', 'post'],
  ['/internal/v1/sessions/refresh', 'post'],
  ['/internal/v1/sessions/validate', 'post'],
];

for (const [path, method] of requiredOperations) {
  if (document.paths[path]?.[method] === undefined) {
    throw new Error(`Auth OpenAPI is missing ${method.toUpperCase()} ${path}`);
  }
}

