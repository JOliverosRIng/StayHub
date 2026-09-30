import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import YAML from 'yaml';

import {
  REGISTER_IDEMPOTENCY_HEADER,
  REGISTER_OPERATION_ID,
  REGISTER_PUBLIC_ROLES,
  REGISTER_REQUEST_SCHEMA,
  REGISTER_RESPONSE_CODES,
  REGISTER_USER_SUMMARY_SCHEMA,
} from '@gateway/interfaces/openapi/register.openapi';

/**
 * GW-030 — Verifica que `register.openapi.ts` esté sincronizado 1:1 con la operación
 * `POST /auth/register` de `contracts/openapi-public.yaml`.
 */

interface ParamView {
  readonly name?: string;
  readonly in?: string;
  readonly required?: boolean;
  readonly schema?: { readonly type?: string; readonly format?: string };
}

interface PropView {
  readonly type?: string;
  readonly format?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly enum?: readonly string[];
  readonly $ref?: string;
  readonly allOf?: readonly { readonly $ref?: string }[];
}

interface SchemaView {
  readonly type?: string;
  readonly additionalProperties?: unknown;
  readonly required?: readonly string[];
  readonly properties?: Record<string, PropView>;
  readonly enum?: readonly string[];
}

interface OperationView {
  readonly operationId?: string;
  readonly parameters?: readonly ParamView[];
  readonly requestBody?: { readonly content: Record<string, { readonly schema: { readonly $ref?: string } }> };
  readonly responses: Record<string, unknown>;
}

interface DocView {
  readonly paths: Record<string, { readonly post?: OperationView }>;
  readonly components: { readonly schemas: Record<string, SchemaView> };
}

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

const doc = YAML.parse(readFileSync(CONTRACT, 'utf8')) as DocView;
const operation = doc.paths['/auth/register']?.post;
const request = REGISTER_REQUEST_SCHEMA as unknown as SchemaView;
const summary = REGISTER_USER_SUMMARY_SCHEMA as unknown as SchemaView;

function yamlRole(schema: SchemaView): readonly string[] | undefined {
  const role = schema.properties?.['role'];
  if (role?.enum !== undefined) return role.enum;
  const ref = role?.$ref ?? role?.allOf?.[0]?.$ref;
  const name = ref?.split('/').pop();
  return name === undefined ? undefined : doc.components.schemas[name]?.enum;
}

describe('Sincronización OpenAPI del registro (GW-030)', () => {
  it('documenta la operación POST /auth/register en el contrato público', () => {
    expect(operation).toBeDefined();
    expect(operation?.operationId).toBe(REGISTER_OPERATION_ID);
  });

  it('exige el header Idempotency-Key UUID igual que register.openapi.ts', () => {
    const header = operation?.parameters?.find((param) => param.name === REGISTER_IDEMPOTENCY_HEADER);
    expect(header?.in).toBe('header');
    expect(header?.required).toBe(true);
    expect(header?.schema?.type).toBe('string');
    expect(header?.schema?.format).toBe('uuid');
  });

  it('conserva exactamente los estados 201/400/409/429/503', () => {
    const yamlCodes = Object.keys(operation?.responses ?? {})
      .map(Number)
      .sort((a, b) => a - b);
    expect(yamlCodes).toEqual([...REGISTER_RESPONSE_CODES].sort((a, b) => a - b));
  });

  it('mantiene el DTO cerrado con contraseña 8–128 y roles públicos, alineado 1:1', () => {
    const yamlRequest = doc.components.schemas['RegisterRequest'];
    expect(yamlRequest?.additionalProperties).toBe(false);
    expect([...(yamlRequest?.required ?? [])].sort()).toEqual(['email', 'name', 'password', 'role']);

    const yamlPassword = yamlRequest?.properties?.['password'];
    expect(yamlPassword?.minLength).toBe(8);
    expect(yamlPassword?.maxLength).toBe(128);

    const yamlName = yamlRequest?.properties?.['name'];
    expect(yamlName?.minLength).toBe(2);
    expect(yamlName?.maxLength).toBe(100);

    const yamlEmail = yamlRequest?.properties?.['email'];
    expect(yamlEmail?.format).toBe('email');
    expect(yamlEmail?.maxLength).toBe(254);

    expect(yamlRole(yamlRequest ?? {})).toEqual([...REGISTER_PUBLIC_ROLES]);

    // register.openapi.ts refleja lo mismo.
    expect(request.additionalProperties).toBe(false);
    expect([...(request.required ?? [])].sort()).toEqual(['email', 'name', 'password', 'role']);
    expect(request.properties?.['password']?.minLength).toBe(8);
    expect(request.properties?.['password']?.maxLength).toBe(128);
    expect(request.properties?.['role']?.enum).toEqual([...REGISTER_PUBLIC_ROLES]);
  });

  it('describe el UserSummary de respuesta alineado con el contrato', () => {
    const yamlSummary = doc.components.schemas['UserSummary'];
    expect([...(yamlSummary?.required ?? [])].sort()).toEqual(['email', 'id', 'name', 'role']);
    expect([...(summary.required ?? [])].sort()).toEqual(['email', 'id', 'name', 'role']);
  });
});
