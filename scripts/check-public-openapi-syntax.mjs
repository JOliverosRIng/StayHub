import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const contractPath = new URL(
  '../specs/001-fundamentos-identidad/contracts/openapi-public.yaml',
  import.meta.url,
);
const document = parse(await readFile(contractPath, 'utf8'));

if (document?.openapi !== '3.0.3' || typeof document.paths !== 'object') {
  throw new Error('Public OpenAPI must be a valid OpenAPI 3.0.3 document');
}

const servers = document.servers ?? [];
if (servers.length !== 1 || servers[0].url !== 'https://localhost:8080/api/v1') {
  throw new Error('Public OpenAPI must declare the single server https://localhost:8080/api/v1');
}

const requiredOperations = [
  ['/auth/register', 'post'],
  ['/auth/login', 'post'],
  ['/auth/refresh', 'post'],
  ['/auth/validate', 'get'],
  ['/users/{userId}/profile', 'get'],
  ['/users/{userId}/profile', 'patch'],
  ['/users/{userId}/profile/photo', 'get'],
];

for (const [path, method] of requiredOperations) {
  if (document.paths[path]?.[method] === undefined) {
    throw new Error(`Public OpenAPI is missing ${method.toUpperCase()} ${path}`);
  }
}

const problem = document.components?.schemas?.Problem;
const requiredProblemFields = [
  'type',
  'title',
  'status',
  'detail',
  'instance',
  'code',
  'traceId',
];

if (!problem || problem.required?.length !== requiredProblemFields.length) {
  throw new Error('Public Problem must require exactly the seven canonical fields');
}
