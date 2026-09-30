import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

/**
 * GW-030 — Documentación Swagger de `POST /api/v1/auth/register`, alineada 1:1 con
 * `contracts/openapi-public.yaml` y con la ruta implementada en GW-029.
 *
 * Las constantes exportadas son la fuente única desde la que se construye el decorador
 * {@link RegisterApiDocs} (aplicado al controlador) y contra las que la prueba de contrato
 * comprueba la sincronización con el YAML público.
 *
 * NOTA: esto documenta el borde público del Gateway. La saga externa de registro con Auth NO se
 * declara completa aquí; su integración real se valida en GW-058.
 */

export const REGISTER_PATH = '/auth/register';
export const REGISTER_OPERATION_ID = 'register';
export const REGISTER_TAG = 'Authentication';
export const REGISTER_IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const REGISTER_RESPONSE_CODES: readonly number[] = [201, 400, 409, 429, 503];
export const REGISTER_PUBLIC_ROLES: readonly string[] = ['GUEST', 'OWNER'];

export const REGISTER_REQUEST_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'email', 'password', 'role'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 100 },
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: {
      type: 'string',
      format: 'password',
      minLength: 8,
      maxLength: 128,
      writeOnly: true,
      description: 'Evaluated exactly as supplied; no trimming, case folding or normalization.',
    },
    role: { type: 'string', enum: [...REGISTER_PUBLIC_ROLES] },
  },
};

export const REGISTER_USER_SUMMARY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['id', 'name', 'email', 'role'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['GUEST', 'OWNER', 'ADMIN'] },
  },
};

const PROBLEM_CONTENT = {
  'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
};

/** Decorador que documenta la operación de registro sobre el método del controlador (GW-029). */
export function RegisterApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(REGISTER_TAG),
    ApiOperation({
      operationId: REGISTER_OPERATION_ID,
      summary: 'Register a new GUEST or OWNER account',
    }),
    ApiHeader({
      name: REGISTER_IDEMPOTENCY_HEADER,
      required: true,
      description: 'Client-generated UUID that makes a retried registration safe to repeat.',
      schema: { type: 'string', format: 'uuid' },
    }),
    ApiBody({ schema: REGISTER_REQUEST_SCHEMA as SchemaObject }),
    ApiResponse({
      status: 201,
      description: 'Account completed and active.',
      content: { 'application/json': { schema: REGISTER_USER_SUMMARY_SCHEMA as SchemaObject } },
    }),
    ApiResponse({ status: 400, description: 'Invalid or unknown input; no changes applied.', content: PROBLEM_CONTENT }),
    ApiResponse({ status: 409, description: 'Email or idempotency conflict; no changes applied.', content: PROBLEM_CONTENT }),
    ApiResponse({
      status: 429,
      description: 'Registration rate limit exceeded for the origin.',
      headers: {
        'Retry-After': {
          description: 'Seconds until this request may be retried.',
          schema: { type: 'integer', minimum: 1 },
        },
      },
      content: PROBLEM_CONTENT,
    }),
    ApiResponse({ status: 503, description: 'An authoritative dependency is unavailable; fails closed.', content: PROBLEM_CONTENT }),
  );
}
