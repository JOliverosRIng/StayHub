import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import YAML from 'yaml';

const CONTRACT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'specs',
  '001-fundamentos-identidad',
  'contracts',
  'openapi-public.yaml',
);

const doc = YAML.parse(readFileSync(CONTRACT, 'utf8')) as {
  servers: { url: string }[];
  paths: Record<string, Record<string, unknown>>;
};

const PUBLIC_OPERATIONS: [string, string][] = [
  ['/auth/register', 'post'],
  ['/auth/login', 'post'],
  ['/auth/refresh', 'post'],
  ['/auth/validate', 'get'],
  ['/users/{userId}/profile', 'get'],
  ['/users/{userId}/profile', 'patch'],
  ['/users/{userId}/profile/photo', 'get'],
];

describe('Contrato publico del Gateway (GW-021, D1)', () => {
  it('sirve el prefijo /api/v1 por HTTPS en el puerto 8080', () => {
    expect(doc.servers.map((server) => server.url)).toEqual(['https://localhost:8080/api/v1']);
  });

  it('declara las siete operaciones publicas del Sprint 1', () => {
    for (const [path, method] of PUBLIC_OPERATIONS) {
      expect(doc.paths[path]).toBeDefined();
      expect(doc.paths[path]?.[method]).toBeDefined();
    }
  });

  it('no expone operaciones fuera del alcance de la feature', () => {
    expect(Object.keys(doc.paths).sort()).toEqual(
      [...new Set(PUBLIC_OPERATIONS.map(([path]) => path))].sort(),
    );
  });
});
