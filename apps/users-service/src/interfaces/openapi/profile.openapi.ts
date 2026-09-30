import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { Problems, roleSchema } from './schemas';
export const preferencesSchema: SchemaObject = { type: 'object', maxProperties: 20, additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] } };
export const profileSchema: SchemaObject = { type: 'object', required: ['id', 'name', 'email', 'role', 'version'], properties: {
  id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, email: { type: 'string', format: 'email' }, role: roleSchema, phone: { type: 'string', nullable: true }, preferences: { allOf: [preferencesSchema], nullable: true }, photoUrl: { type: 'string', nullable: true }, version: { type: 'integer', minimum: 1 },
} };
export const patchSchema: SchemaObject = { type: 'object', additionalProperties: false, required: ['expectedVersion'], properties: {
  expectedVersion: { type: 'integer', minimum: 1 }, name: { type: 'string', minLength: 2, maxLength: 100 }, email: { type: 'string', format: 'email', maxLength: 254 }, phone: { type: 'string', nullable: true, pattern: '^\\+[1-9][0-9]{7,14}$' }, preferences: { allOf: [preferencesSchema], nullable: true }, photo: { type: 'string', nullable: true, enum: [null] },
} };
export function ProfileGetApi(): ReturnType<typeof applyDecorators> { return applyDecorators(ApiOperation({ operationId: 'getProfile' }), ApiParam({ name: 'userId', format: 'uuid' }), ApiResponse({ status: 200, description: 'Sanitized profile.', schema: profileSchema }), Problems(401, 403, 404, 503)); }
export function ProfilePatchApi(): ReturnType<typeof applyDecorators> { return applyDecorators(
  ApiOperation({ operationId: 'updateProfile', description: 'Atomic partial update. Omitted fields are preserved; null clears optional values. File plus photo:null and empty changes are invalid. Authentication precedes ownership and input validation.' }), ApiParam({ name: 'userId', format: 'uuid' }), ApiConsumes('multipart/form-data'),
  ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['profile'], properties: { profile: patchSchema, photo: { type: 'string', format: 'binary', description: 'JPEG or PNG, maximum 5,000,000 bytes (5 MB decimal).' } } } }),
  ApiResponse({ status: 200, description: 'Atomic update complete.', schema: profileSchema }), Problems(400, 401, 403, 404, 409, 413, 415, 503)); }
export function ProfilePhotoApi(): ReturnType<typeof applyDecorators> { return applyDecorators(ApiOperation({ operationId: 'getProfilePhoto' }), ApiParam({ name: 'userId', format: 'uuid' }), ApiResponse({ status: 200, description: 'JPEG/PNG bytes.', headers: { ETag: { schema: { type: 'string' } } }, content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } }, 'image/png': { schema: { type: 'string', format: 'binary' } } } }), Problems(401, 403, 404, 503)); }
