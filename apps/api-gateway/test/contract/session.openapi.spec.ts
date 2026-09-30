import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import YAML from 'yaml';

import {
  BEARER_SCHEME,
  LOGIN_OPERATION_ID,
  LOGIN_REQUEST_SCHEMA,
  LOGIN_RESPONSE_CODES,
  PRINCIPAL_SCHEMA,
  REFRESH_COOKIE_SCHEME,
  REFRESH_OPERATION_ID,
  REFRESH_RESPONSE_CODES,
  SESSION_ROLES,
  TOKEN_RESPONSE_SCHEMA,
  VALIDATE_OPERATION_ID,
  VALIDATE_RESPONSE_CODES,
} from '@gateway/interfaces/openapi/session.openapi';

/**
 * GW-042 — Verifica que `session.openapi.ts` esté sincronizado 1:1 con las operaciones de sesión
 * de `contracts/openapi-public.yaml` (fuente), sin drift.
 */

interface RefOrSchema {
  readonly $ref?: string;
}

interface PropView {
  readonly type?: string;
  readonly format?: string;
  readonly maxLength?: number;
  readonly enum?: readonly (string | number)[];
}

interface SchemaView {
  readonly additionalProperties?: unknown;
  readonly required?: readonly string[];
  readonly properties?: Record<string, PropView>;
}

interface ResponseView {
  readonly headers?: Record<string, unknown>;
  readonly content?: Record<string, { readonly schema?: RefOrSchema }>;
}

interface OperationView {
  readonly operationId?: string;
  readonly security?: readonly Record<string, unknown>[];
  readonly requestBody?: { readonly content: Record<string, { readonly schema: RefOrSchema }> };
  readonly responses: Record<string, ResponseView>;
}

interface DocView {
  readonly paths: Record<string, { readonly post?: OperationView; readonly get?: OperationView }>;
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
const login = doc.paths['/auth/login']?.post;
const refresh = doc.paths['/auth/refresh']?.post;
const validate = doc.paths['/auth/validate']?.get;

function codesOf(operation: OperationView | undefined): number[] {
  return Object.keys(operation?.responses ?? {})
    .map(Number)
    .sort((a, b) => a - b);
}

function schemeNames(operation: OperationView | undefined): string[] {
  return (operation?.security ?? []).flatMap((requirement) => Object.keys(requirement));
}

function refOf(schema: RefOrSchema | undefined): string | undefined {
  return schema?.$ref?.split('/').pop();
}

describe('Sincronización OpenAPI de sesión (GW-042)', () => {
  it('documenta login/refresh/validate con sus operationId', () => {
    expect(login?.operationId).toBe(LOGIN_OPERATION_ID);
    expect(refresh?.operationId).toBe(REFRESH_OPERATION_ID);
    expect(validate?.operationId).toBe(VALIDATE_OPERATION_ID);
  });

  it('conserva los estados de cada operación alineados con session.openapi.ts', () => {
    expect(codesOf(login)).toEqual([...LOGIN_RESPONSE_CODES].sort((a, b) => a - b));
    expect(codesOf(refresh)).toEqual([...REFRESH_RESPONSE_CODES].sort((a, b) => a - b));
    expect(codesOf(validate)).toEqual([...VALIDATE_RESPONSE_CODES].sort((a, b) => a - b));
  });

  it('login y refresh emiten Set-Cookie en el 200 y el refresh viaja por cookie', () => {
    expect(login?.responses['200']?.headers?.['Set-Cookie']).toBeDefined();
    expect(refresh?.responses['200']?.headers?.['Set-Cookie']).toBeDefined();
    expect(schemeNames(refresh)).toContain(REFRESH_COOKIE_SCHEME);
  });

  it('validate exige bearer y responde el Principal mínimo', () => {
    expect(schemeNames(validate)).toContain(BEARER_SCHEME);
    expect(refOf(validate?.responses['200']?.content?.['application/json']?.schema)).toBe('Principal');
  });

  it('login referencia LoginRequest y TokenResponse (con Principal) del contrato', () => {
    expect(refOf(login?.requestBody?.content['application/json']?.schema)).toBe('LoginRequest');
    expect(refOf(login?.responses['200']?.content?.['application/json']?.schema)).toBe('TokenResponse');
  });

  it('LoginRequest del contrato coincide 1:1 con session.openapi.ts', () => {
    const yamlLogin = doc.components.schemas['LoginRequest'];
    const constLogin = LOGIN_REQUEST_SCHEMA as unknown as SchemaView;

    expect(yamlLogin?.additionalProperties).toBe(false);
    expect([...(yamlLogin?.required ?? [])].sort()).toEqual(['email', 'password']);
    expect([...(constLogin.required ?? [])].sort()).toEqual(['email', 'password']);
    expect(yamlLogin?.properties?.['email']?.maxLength).toBe(254);
    expect(constLogin.properties?.['email']?.maxLength).toBe(254);
    expect(yamlLogin?.properties?.['password']?.maxLength).toBe(128);
    expect(constLogin.properties?.['password']?.maxLength).toBe(128);
  });

  it('Principal del contrato coincide 1:1 con session.openapi.ts', () => {
    const yamlPrincipal = doc.components.schemas['Principal'];
    const constPrincipal = PRINCIPAL_SCHEMA as unknown as SchemaView;

    expect(yamlPrincipal?.additionalProperties).toBe(false);
    expect([...(yamlPrincipal?.required ?? [])].sort()).toEqual(['role', 'sessionId', 'userId']);
    expect([...(constPrincipal.required ?? [])].sort()).toEqual(['role', 'sessionId', 'userId']);
    expect(constPrincipal.properties?.['role']?.enum).toEqual([...SESSION_ROLES]);
  });

  it('TokenResponse del contrato coincide 1:1 con session.openapi.ts', () => {
    const yamlToken = doc.components.schemas['TokenResponse'];
    const constToken = TOKEN_RESPONSE_SCHEMA as unknown as SchemaView;

    expect([...(yamlToken?.required ?? [])].sort()).toEqual(
      ['accessToken', 'expiresIn', 'tokenType', 'user'],
    );
    expect([...(constToken.required ?? [])].sort()).toEqual(
      ['accessToken', 'expiresIn', 'tokenType', 'user'],
    );
    expect(constToken.properties?.['tokenType']?.enum).toEqual(['Bearer']);
    expect(constToken.properties?.['expiresIn']?.enum).toEqual([3600]);
  });
});
