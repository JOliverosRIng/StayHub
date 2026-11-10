import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import YAML from 'yaml';

/**
 * D4 — Problem Details único y seguro (constitución §V).
 *
 * Los contratos PROPIOS del Gateway (`openapi-public.yaml` y `openapi-auth-service.yaml`) comparten
 * exactamente el mismo esquema `components.schemas.Problem` canónico. El contrato de Users es de G2
 * y evolucionó a esquemas inline por operación (sin `components.schemas.Problem`); en lugar de
 * reescribir un artefacto ajeno, se comprueba que TODAS sus respuestas Problem Details conservan
 * los mismos nombres de campo y la forma de `errors` (`field`/`code`). Así la auditoría sigue
 * detectando una divergencia real sin imponer la representación interna de otro grupo.
 */

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

const GATEWAY_CONTRACTS = ['openapi-public.yaml', 'openapi-auth-service.yaml'] as const;
const USERS_CONTRACT = 'openapi-users-service.yaml';

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

interface ContractDocument {
  paths?: Record<string, Record<string, unknown>>;
  components: { schemas: { Problem: ProblemSchema; FieldError?: unknown } };
}

const load = (file: string): ContractDocument =>
  YAML.parse(readFileSync(join(CONTRACTS_DIR, file), 'utf8')) as ContractDocument;

describe('Unificacion de Problem Details (D4, Constitucion V)', () => {
  it.each(GATEWAY_CONTRACTS)('%s exige el conjunto canonico de campos', (file) => {
    const { components } = load(file);

    expect(components.schemas.Problem.required).toEqual(CANONICAL_REQUIRED);
  });

  it.each(GATEWAY_CONTRACTS)('%s declara type como uri-reference', (file) => {
    const { components } = load(file);

    expect(components.schemas.Problem.properties.type.format).toBe('uri-reference');
  });

  it.each(GATEWAY_CONTRACTS)('%s modela errors como FieldError[] y no como string[]', (file) => {
    const { components } = load(file);
    const items = components.schemas.Problem.properties.errors?.items;

    expect(items?.$ref).toBe('#/components/schemas/FieldError');
    expect(items?.type).toBeUndefined();
  });

  it.each(GATEWAY_CONTRACTS)('%s define el esquema FieldError referenciado', (file) => {
    const { components } = load(file);

    expect(components.schemas.FieldError).toBeDefined();
  });

  it('mantiene un unico esquema Problem en los contratos propios del Gateway', () => {
    const shapes = GATEWAY_CONTRACTS.map((file) =>
      JSON.stringify(load(file).components.schemas.Problem),
    );

    expect(new Set(shapes).size).toBe(1);
  });

  it('el contrato externo de Users conserva los campos canonicos en sus respuestas inline', () => {
    const document = load(USERS_CONTRACT);
    const schemas = inlineProblemSchemas(document);

    expect(schemas.length).toBeGreaterThan(0);
    for (const schema of schemas) {
      expect(schema.required).toEqual(expect.arrayContaining([...CANONICAL_REQUIRED, 'errors']));
      expect(schema.properties.errors?.items?.type).toBe('object');
      const errorRequired = schema.properties.errors?.items?.required ?? [];
      expect(errorRequired).toEqual(expect.arrayContaining(['field', 'code']));
    }
  });
});

interface InlineProblemSchema {
  readonly required: readonly string[];
  readonly properties: {
    readonly errors?: {
      readonly items?: {
        readonly type?: string;
        readonly required?: readonly string[];
      };
    };
  };
}

/** Recoge los esquemas Problem inline declarados en las respuestas de cada operación. */
function inlineProblemSchemas(document: ContractDocument): InlineProblemSchema[] {
  const schemas: InlineProblemSchema[] = [];
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      if (operation === null || typeof operation !== 'object') continue;
      const responses = (operation as { responses?: Record<string, unknown> }).responses ?? {};
      for (const response of Object.values(responses)) {
        const content = (response as { content?: Record<string, { schema?: unknown }> }).content;
        const schema = content?.['application/problem+json']?.schema;
        if (schema !== null && typeof schema === 'object' && 'required' in schema) {
          schemas.push(schema as InlineProblemSchema);
        }
      }
    }
  }
  return schemas;
}
