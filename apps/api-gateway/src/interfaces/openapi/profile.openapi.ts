import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

/**
 * GW-049 — Documentación Swagger de las operaciones de perfil y foto, alineada 1:1 con
 * `contracts/openapi-public.yaml` (fuente) y con las rutas implementadas en GW-048.
 *
 * Las constantes exportadas son la fuente única desde la que se construyen los decoradores y
 * contra las que la prueba de contrato comprueba la ausencia de drift. El límite de la foto es
 * EXACTAMENTE 5.000.000 bytes decimales (único; nunca 5 MiB = 5.242.880).
 */

export const PROFILE_TAG = 'Profile';
export const BEARER_SCHEME = 'bearerAuth';
export const GET_PROFILE_OPERATION_ID = 'getOwnProfile';
export const UPDATE_PROFILE_OPERATION_ID = 'updateOwnProfile';
export const GET_PHOTO_OPERATION_ID = 'getOwnProfilePhoto';

export const PHOTO_MAX_BYTES = 5_000_000;
export const PHOTO_MEBIBYTES = 5 * 1024 * 1024;
export const PREFERENCES_MAX = 20;
export const PHOTO_LIMIT_DESCRIPTION = 'JPEG or PNG, maximum 5,000,000 bytes (5 MB decimal).';

export const GET_PROFILE_RESPONSE_CODES: readonly number[] = [200, 401, 403, 404, 503];
export const UPDATE_PROFILE_RESPONSE_CODES: readonly number[] = [
  200, 400, 401, 403, 409, 413, 415, 503,
];
export const GET_PHOTO_RESPONSE_CODES: readonly number[] = [200, 401, 403, 404];
export const PROFILE_ROLES: readonly string[] = ['GUEST', 'OWNER', 'ADMIN'];
const E164_PATTERN = '^\\+[1-9][0-9]{7,14}$';

export const PROFILE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'email', 'role', 'version'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 2, maxLength: 100 },
    email: { type: 'string', format: 'email', maxLength: 254 },
    role: { type: 'string', enum: [...PROFILE_ROLES] },
    phone: { type: 'string', nullable: true, pattern: E164_PATTERN },
    preferences: { type: 'object', nullable: true, maxProperties: PREFERENCES_MAX },
    photoUrl: { type: 'string', format: 'uri', nullable: true },
    version: { type: 'integer', minimum: 1 },
  },
};

export const PROFILE_PATCH_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 2, maxLength: 100 },
    email: { type: 'string', format: 'email', maxLength: 254 },
    phone: { type: 'string', nullable: true, pattern: E164_PATTERN },
    preferences: { type: 'object', nullable: true, maxProperties: PREFERENCES_MAX },
    photo: { type: 'string', nullable: true, enum: [null] },
  },
};

const PATCH_MULTIPART_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['profile'],
  properties: {
    profile: PROFILE_PATCH_SCHEMA,
    photo: { type: 'string', format: 'binary', description: PHOTO_LIMIT_DESCRIPTION },
  },
};

const PROBLEM_CONTENT = {
  'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
};

const USER_ID_PARAM = {
  name: 'userId',
  required: true,
  schema: { type: 'string', format: 'uuid' },
} as const;

function problem(status: number, description: string): ReturnType<typeof ApiResponse> {
  return ApiResponse({ status, description, content: PROBLEM_CONTENT });
}

/** `GET /users/{userId}/profile`: perfil propio del usuario autenticado. */
export function ProfileApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(PROFILE_TAG),
    ApiOperation({ operationId: GET_PROFILE_OPERATION_ID, summary: 'Read the own profile' }),
    ApiBearerAuth(BEARER_SCHEME),
    ApiParam(USER_ID_PARAM),
    ApiResponse({
      status: 200,
      description: 'Profile belonging to the authenticated identity.',
      content: { 'application/json': { schema: PROFILE_SCHEMA as SchemaObject } },
    }),
    problem(401, 'Missing or invalid authentication.'),
    problem(403, 'Authenticated but not authorized for the target.'),
    problem(404, 'Own requested resource is absent.'),
    problem(503, 'An authoritative dependency is unavailable; fails closed.'),
  );
}

/** `PATCH /users/{userId}/profile`: edición atómica; multipart con foto ≤ 5.000.000 bytes. */
export function ProfilePatchApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(PROFILE_TAG),
    ApiOperation({ operationId: UPDATE_PROFILE_OPERATION_ID, summary: 'Update the own profile' }),
    ApiBearerAuth(BEARER_SCHEME),
    ApiParam(USER_ID_PARAM),
    ApiConsumes('multipart/form-data'),
    ApiBody({ schema: PATCH_MULTIPART_SCHEMA as SchemaObject }),
    ApiResponse({
      status: 200,
      description: 'Complete updated profile.',
      content: { 'application/json': { schema: PROFILE_SCHEMA as SchemaObject } },
    }),
    problem(400, 'Invalid or unknown input; no changes applied.'),
    problem(401, 'Missing or invalid authentication.'),
    problem(403, 'Authenticated but not authorized for the target.'),
    problem(409, 'Email or version conflict; no changes applied.'),
    problem(413, 'Photo exceeds 5,000,000 bytes.'),
    problem(415, 'Photo is not a valid JPEG or PNG.'),
    problem(503, 'An authoritative dependency is unavailable; fails closed.'),
  );
}

/** `GET /users/{userId}/profile/photo`: descarga de la foto propia. */
export function ProfilePhotoApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(PROFILE_TAG),
    ApiOperation({ operationId: GET_PHOTO_OPERATION_ID, summary: 'Download the own profile photo' }),
    ApiBearerAuth(BEARER_SCHEME),
    ApiParam(USER_ID_PARAM),
    ApiResponse({
      status: 200,
      description: 'Current profile photo.',
      headers: { ETag: { description: 'Photo entity tag.', schema: { type: 'string' } } },
      content: {
        'image/jpeg': { schema: { type: 'string', format: 'binary' } },
        'image/png': { schema: { type: 'string', format: 'binary' } },
      },
    }),
    problem(401, 'Missing or invalid authentication.'),
    problem(403, 'Authenticated but not authorized for the target.'),
    problem(404, 'Own requested resource is absent.'),
  );
}
