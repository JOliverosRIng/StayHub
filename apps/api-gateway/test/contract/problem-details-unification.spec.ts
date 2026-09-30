import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import YAML from 'yaml';

const CONTRACTS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'specs',
  '001-fundamentos-identidad',
  'contracts',
);

const FILES = [
  'openapi-public.yaml',
  'openapi-auth-service.yaml',
  'openapi-users-service.yaml',
] as const;

const CANONICAL_REQUIRED = [
  'type',
  'title',
  'status',
  'detail',
  'instance',
  'code',
  'traceId',
];

interface ProblemSchema {
  required: string[];
  properties: {
    type: { type: string; format?: string };
    errors?: { items: { $ref?: string; type?: string } };
  };
}

const load = (file: string): { components: { schemas: { Problem: ProblemSchema; FieldError?: unknown } } } =>
  YAML.parse(readFileSync(join(CONTRACTS_DIR, file), 'utf8')) as {
    components: { schemas: { Problem: ProblemSchema; FieldError?: unknown } };
  };

describe('Unificacion de Problem Details (D4, Constitucion V)', () => {
  it.each(FILES)('%s exige el conjunto canonico de campos', (file) => {
    const { components } = load(file);

    expect(components.schemas.Problem.required).toEqual(CANONICAL_REQUIRED);
  });

  it.each(FILES)('%s declara type como uri-reference', (file) => {
    const { components } = load(file);

    expect(components.schemas.Problem.properties.type.format).toBe('uri-reference');
  });

  it.each(FILES)('%s modela errors como FieldError[] y no como string[]', (file) => {
    const { components } = load(file);
    const items = components.schemas.Problem.properties.errors?.items;

    expect(items?.$ref).toBe('#/components/schemas/FieldError');
    expect(items?.type).toBeUndefined();
  });

  it.each(FILES)('%s define el esquema FieldError referenciado', (file) => {
    const { components } = load(file);

    expect(components.schemas.FieldError).toBeDefined();
  });

  it('mantiene un unico esquema Problem en los tres contratos', () => {
    const shapes = FILES.map((file) => JSON.stringify(load(file).components.schemas.Problem));

    expect(new Set(shapes).size).toBe(1);
  });
});
