import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

import type { AuthUsersHarness, HttpResponse } from './auth-users-harness';

// Flujos reutilizables para las suites Auth<->Users (task-06). Todo pasa por HTTP
// contra los servicios reales del harness de task-05; no hay dobles.

export const PASSWORD = 'Correct-Horse-Battery-Staple-42';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Role = 'GUEST' | 'OWNER';

export interface RegisterBody {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: Role;
}

export interface RegisterResponse {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
}

export interface TokenPairResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly absoluteExpiresAt: string;
  readonly principal: { readonly userId: string; readonly sessionId: string; readonly role: string };
}

export interface ProfileResponse {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly phone: string | null;
  readonly preferences: Record<string, unknown> | null;
  readonly photoUrl: string | null;
  readonly version: number;
}

export interface UserSummaryResponse {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly status: 'PENDING' | 'ACTIVE' | 'CANCELLED';
}

export function syntheticEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

export function registerBody(prefix: string, role: Role = 'GUEST'): RegisterBody {
  return { name: `Test ${prefix}`, email: syntheticEmail(prefix), password: PASSWORD, role };
}

export async function register(
  h: AuthUsersHarness,
  body: RegisterBody,
  idempotencyKey: string = randomUUID(),
): Promise<HttpResponse<RegisterResponse>> {
  return h.authRequest<RegisterResponse>('/internal/v1/registrations', {
    token: await h.serviceToken(),
    idempotencyKey,
    traceId: `int-register-${randomUUID()}`,
    body,
  });
}

export async function login(
  h: AuthUsersHarness,
  email: string,
  password: string = PASSWORD,
): Promise<HttpResponse<TokenPairResponse>> {
  return h.authRequest<TokenPairResponse>('/internal/v1/login', {
    token: await h.serviceToken(),
    traceId: `int-login-${randomUUID()}`,
    body: { email, password },
  });
}

export async function refresh(
  h: AuthUsersHarness,
  refreshToken: string,
): Promise<HttpResponse<TokenPairResponse>> {
  return h.authRequest<TokenPairResponse>('/internal/v1/sessions/refresh', {
    token: await h.serviceToken(),
    traceId: `int-refresh-${randomUUID()}`,
    body: { refreshToken },
  });
}

export async function validateSession(
  h: AuthUsersHarness,
  sessionId: string,
  userId: string,
): Promise<HttpResponse<{ active: boolean; role: string }>> {
  return h.authRequest('/internal/v1/sessions/validate', {
    token: await h.serviceToken(),
    traceId: `int-validate-${randomUUID()}`,
    body: { sessionId, userId },
  });
}

export async function getRegistration(
  h: AuthUsersHarness,
  registrationId: string,
): Promise<HttpResponse<UserSummaryResponse>> {
  return h.usersRequest<UserSummaryResponse>(`/internal/v1/registrations/${registrationId}`, {
    token: await h.usersServiceToken({ scope: h.registrationScope }),
  });
}

export async function resolveIdentity(
  h: AuthUsersHarness,
  email: string,
): Promise<HttpResponse<Record<string, unknown>>> {
  return h.usersRequest('/internal/v1/login-identities/resolve', {
    token: await h.usersServiceToken({ scope: h.lookupScope }),
    body: { email },
  });
}

export function getProfile(
  h: AuthUsersHarness,
  userId: string,
  accessToken: string,
): Promise<HttpResponse<ProfileResponse>> {
  return h.usersRequest<ProfileResponse>(`/internal/v1/users/${userId}/profile`, { token: accessToken });
}

export function patchProfile(
  h: AuthUsersHarness,
  userId: string,
  accessToken: string,
  profile: Record<string, unknown>,
): Promise<HttpResponse<ProfileResponse>> {
  const form = new FormData();
  form.append('profile', JSON.stringify(profile));
  return h.usersRequest<ProfileResponse>(`/internal/v1/users/${userId}/profile`, {
    method: 'PATCH',
    token: accessToken,
    form,
  });
}

// Crea una identidad directamente en Users con el token de servicio autorizado
// (rutas internas reales) y opcionalmente la lleva a ACTIVE o CANCELLED. No crea
// credencial en Auth: sirve para INT-07/INT-08.
export async function createUsersIdentity(
  h: AuthUsersHarness,
  target: 'PENDING' | 'ACTIVE' | 'CANCELLED',
  role: Role = 'GUEST',
): Promise<{ registrationId: string; userId: string; email: string }> {
  const token = await h.usersServiceToken({ scope: h.registrationScope });
  const registrationId = randomUUID();
  const userId = randomUUID();
  const email = syntheticEmail(`users-${target.toLowerCase()}`);
  const created = await h.usersRequest<UserSummaryResponse>('/internal/v1/registrations', {
    token,
    idempotencyKey: registrationId,
    body: { registrationId, userId, name: `Direct ${target}`, email, role },
  });
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`No se pudo crear la identidad en Users: HTTP ${created.status} ${created.text}`);
  }
  if (target !== 'PENDING') {
    const action = target === 'ACTIVE' ? 'activate' : 'cancel';
    const transitioned = await h.usersRequest(`/internal/v1/registrations/${registrationId}/${action}`, {
      token,
      method: 'POST',
    });
    if (transitioned.status >= 300) {
      throw new Error(`No se pudo llevar la identidad a ${target}: HTTP ${transitioned.status}`);
    }
  }
  return { registrationId, userId, email };
}

// Campos de un problem+json que no dependen de la petición concreta (traceId,
// instance); sirve para comparar que dos rechazos son indistinguibles.
export function stableProblem(body: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(([key]) => key !== 'traceId' && key !== 'instance'),
  );
}

// Validación mínima de respuestas contra el OpenAPI interno de Users (contrato de
// consumidor). Cubre required, type, enum, format uuid y additionalProperties.
type Schema = Record<string, unknown>;

let usersOpenApi: Schema | undefined;

function loadUsersOpenApi(): Schema {
  usersOpenApi ??= parse(
    readFileSync(
      resolve(__dirname, '../../../../specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml'),
      'utf8',
    ),
  ) as Schema;
  return usersOpenApi;
}

function deref(schema: Schema): Schema {
  const ref = schema.$ref;
  if (typeof ref !== 'string') return schema;
  let node: unknown = loadUsersOpenApi();
  for (const part of ref.replace(/^#\//, '').split('/')) node = (node as Schema)[part];
  return deref(node as Schema);
}

export function usersResponseSchema(path: string, method: string, status: number): Schema {
  const paths = loadUsersOpenApi().paths as Record<string, Record<string, Schema>>;
  const operation = paths[path]?.[method];
  const responses = operation?.responses as Record<string, Schema> | undefined;
  const response = responses?.[String(status)];
  const content = response?.content as Record<string, { schema: Schema }> | undefined;
  const schema = content?.['application/json']?.schema ?? content?.['application/problem+json']?.schema;
  if (schema === undefined) throw new Error(`OpenAPI de Users no define ${method} ${path} ${status}`);
  return deref(schema);
}

export function schemaViolations(value: unknown, schemaInput: Schema, at = '$'): string[] {
  const schema = deref(schemaInput);
  const errors: string[] = [];
  const nullable = schema.nullable === true || (Array.isArray(schema.type) && schema.type.includes('null'));
  if (value === null) return nullable ? [] : [`${at}: null no permitido`];
  const types: unknown[] = Array.isArray(schema.type) ? (schema.type as unknown[]) : [schema.type];
  const type = types.find((t) => t !== 'null');
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errors.push(`${at}: fuera de enum`);
  if (type === 'string') {
    if (typeof value !== 'string') return [`${at}: se esperaba string`];
    if (schema.format === 'uuid' && !UUID_PATTERN.test(value)) errors.push(`${at}: no es uuid`);
  } else if (type === 'integer') {
    if (!Number.isInteger(value)) errors.push(`${at}: se esperaba integer`);
  } else if (type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) return [`${at}: se esperaba object`];
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const key of (schema.required ?? []) as string[]) {
      if (!(key in record)) errors.push(`${at}.${key}: requerido`);
    }
    for (const [key, child] of Object.entries(record)) {
      const childSchema = properties[key];
      if (childSchema === undefined) {
        if (schema.additionalProperties === false) errors.push(`${at}.${key}: propiedad no declarada`);
        continue;
      }
      errors.push(...schemaViolations(child, childSchema, `${at}.${key}`));
    }
  }
  return errors;
}

export function sleep(millis: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, millis));
}

// Sondea hasta que `probe` devuelve un valor que cumple `done` o vence el plazo.
export async function waitFor<T>(
  probe: () => T | Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 30_000,
  intervalMs = 250,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (done(value)) return value;
    if (Date.now() > deadline) return value;
    await sleep(intervalMs);
  }
}

export function registrationState(h: AuthUsersHarness, registrationId: string): string | undefined {
  return h.queryAuthDb(`SELECT state FROM "Registration" WHERE id = '${registrationId}'`)[0];
}

export function usersStatus(h: AuthUsersHarness, registrationId: string): string | undefined {
  return h.queryUsersDb(`SELECT status FROM "User" WHERE "registrationId" = '${registrationId}'`)[0];
}

export function credentialStatus(h: AuthUsersHarness, registrationId: string): string | undefined {
  return h.queryAuthDb(
    `SELECT c.status FROM "Credential" c JOIN "Registration" r ON r."userId" = c."userId" WHERE r.id = '${registrationId}'`,
  )[0];
}

// Invariante cruzado: ninguna identidad ACTIVE en Users tiene la credencial revocada
// (o ausente) en Auth. Se calcula desde las pruebas; Auth nunca lee users_db.
export function activeUsersWithoutUsableCredential(h: AuthUsersHarness): string[] {
  const active = new Set(h.queryUsersDb(`SELECT id FROM "User" WHERE status = 'ACTIVE'`));
  const usable = new Set(h.queryAuthDb(`SELECT "userId" FROM "Credential" WHERE status = 'ACTIVE'`));
  // Las identidades creadas directamente en Users por las pruebas no tienen registro en Auth.
  const orchestrated = new Set(h.queryAuthDb(`SELECT "userId" FROM "Registration"`));
  return [...active].filter((id) => orchestrated.has(id) && !usable.has(id));
}
