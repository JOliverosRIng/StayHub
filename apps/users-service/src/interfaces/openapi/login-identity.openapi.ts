import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Problems, roleSchema } from './schemas';
export function LoginIdentityApi(): ReturnType<typeof applyDecorators> { return applyDecorators(
  ApiOperation({ operationId: 'resolveLoginIdentity' }), ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['email'], properties: { email: { type: 'string', format: 'email', maxLength: 254 } } } }),
  ApiResponse({ status: 200, description: 'Minimal ACTIVE identity.', schema: { type: 'object', required: ['userId', 'role', 'status'], properties: { userId: { type: 'string', format: 'uuid' }, role: roleSchema, status: { type: 'string', enum: ['ACTIVE'] } } } }), Problems(400, 401, 403, 404, 503)); }
