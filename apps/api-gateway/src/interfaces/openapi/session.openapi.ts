import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

/**
 * GW-042 — Documentación Swagger de las operaciones de sesión (`/auth/login`, `/auth/refresh`,
 * `/auth/validate`), alineada 1:1 con `contracts/openapi-public.yaml` (fuente) y con las rutas
 * implementadas en GW-038/GW-041.
 *
 * Las constantes exportadas son la fuente única desde la que se construyen los decoradores y
 * contra las que la prueba de contrato comprueba la ausencia de drift respecto al YAML público.
 *
 * NOTA: documenta el borde público del Gateway. La integración real con Auth NO se declara completa
 * aquí; se valida en GW-058.
 */

export const SESSION_TAG = 'Authentication';
export const LOGIN_OPERATION_ID = 'login';
export const REFRESH_OPERATION_ID = 'refresh';
export const VALIDATE_OPERATION_ID = 'validateAccess';
export const BEARER_SCHEME = 'bearerAuth';
export const REFRESH_COOKIE_SCHEME = 'refreshCookie';

export const LOGIN_RESPONSE_CODES: readonly number[] = [200, 400, 401, 429, 503];
export const REFRESH_RESPONSE_CODES: readonly number[] = [200, 401, 503];
export const VALIDATE_RESPONSE_CODES: readonly number[] = [200, 401, 503];
export const SESSION_ROLES: readonly string[] = ['GUEST', 'OWNER', 'ADMIN'];

export const LOGIN_REQUEST_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: {
      type: 'string',
      format: 'password',
      maxLength: 128,
      writeOnly: true,
      description: 'Evaluated exactly as supplied; no trimming, case folding or normalization.',
    },
  },
};

export const PRINCIPAL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['userId', 'sessionId', 'role'],
  properties: {
    userId: { type: 'string', format: 'uuid' },
    sessionId: { type: 'string', format: 'uuid' },
    role: { type: 'string', enum: [...SESSION_ROLES] },
  },
};

export const TOKEN_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['accessToken', 'tokenType', 'expiresIn', 'user'],
  properties: {
    accessToken: { type: 'string' },
    tokenType: { type: 'string', enum: ['Bearer'] },
    expiresIn: { type: 'integer', enum: [3600] },
    user: PRINCIPAL_SCHEMA,
  },
};

const PROBLEM_CONTENT = {
  'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
};

const SET_COOKIE_HEADER = {
  'Set-Cookie': {
    description: 'Secure, HttpOnly refresh cookie scoped to the refresh route.',
    schema: { type: 'string' },
  },
};

const RETRY_AFTER_HEADER = {
  'Retry-After': {
    description: 'Seconds until this request may be retried.',
    schema: { type: 'integer', minimum: 1 },
  },
};

/** `POST /auth/login`: emite access token + `Principal` y fija la cookie de refresh. */
export function LoginApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(SESSION_TAG),
    ApiOperation({ operationId: LOGIN_OPERATION_ID, summary: 'Authenticate and open a session' }),
    ApiBody({ schema: LOGIN_REQUEST_SCHEMA as SchemaObject }),
    ApiResponse({
      status: 200,
      description: 'Authenticated; also sets the HttpOnly refresh cookie.',
      headers: SET_COOKIE_HEADER,
      content: { 'application/json': { schema: TOKEN_RESPONSE_SCHEMA as SchemaObject } },
    }),
    ApiResponse({ status: 400, description: 'Invalid or unknown input.', content: PROBLEM_CONTENT }),
    ApiResponse({ status: 401, description: 'Invalid credentials; message never enumerates accounts.', content: PROBLEM_CONTENT }),
    ApiResponse({ status: 429, description: 'Login rate limit exceeded for the origin.', headers: RETRY_AFTER_HEADER, content: PROBLEM_CONTENT }),
    ApiResponse({ status: 503, description: 'An authoritative dependency is unavailable; fails closed.', content: PROBLEM_CONTENT }),
  );
}

/** `POST /auth/refresh`: rota el refresh presentado en la cookie. */
export function RefreshApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(SESSION_TAG),
    ApiOperation({ operationId: REFRESH_OPERATION_ID, summary: 'Rotate the session via the refresh cookie' }),
    ApiCookieAuth(REFRESH_COOKIE_SCHEME),
    ApiResponse({
      status: 200,
      description: 'Session renewed without extending its absolute expiry.',
      headers: SET_COOKIE_HEADER,
      content: { 'application/json': { schema: TOKEN_RESPONSE_SCHEMA as SchemaObject } },
    }),
    ApiResponse({ status: 401, description: 'Missing, invalid or reused refresh cookie; a new login is required.', content: PROBLEM_CONTENT }),
    ApiResponse({ status: 503, description: 'An authoritative dependency is unavailable; fails closed.', content: PROBLEM_CONTENT }),
  );
}

/** `GET /auth/validate`: confirma la sesión del bearer y devuelve el `Principal` mínimo. */
export function ValidateApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(SESSION_TAG),
    ApiOperation({ operationId: VALIDATE_OPERATION_ID, summary: 'Validate the current session' }),
    ApiBearerAuth(BEARER_SCHEME),
    ApiResponse({
      status: 200,
      description: 'Current authenticated principal.',
      content: { 'application/json': { schema: PRINCIPAL_SCHEMA as SchemaObject } },
    }),
    ApiResponse({ status: 401, description: 'Missing or invalid bearer.', content: PROBLEM_CONTENT }),
    ApiResponse({ status: 503, description: 'An authoritative dependency is unavailable; fails closed.', content: PROBLEM_CONTENT }),
  );
}
