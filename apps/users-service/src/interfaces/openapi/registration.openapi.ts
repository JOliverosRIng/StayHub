import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Problems, userSummarySchema } from './schemas';
export function RegistrationCreateApi(): ReturnType<typeof applyDecorators> { return applyDecorators(
  ApiOperation({ operationId: 'createPendingUser' }),
  ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['registrationId', 'userId', 'name', 'email', 'role'], properties: {
    registrationId: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' }, name: { type: 'string', minLength: 2, maxLength: 100 }, email: { type: 'string', format: 'email', maxLength: 254 }, role: { type: 'string', enum: ['GUEST', 'OWNER'] },
  } } }), ApiResponse({ status: 201, description: 'Pending user created or same command replayed.', schema: userSummarySchema }), Problems(400, 401, 403, 409, 503)); }
export function RegistrationGetApi(): ReturnType<typeof applyDecorators> { return applyDecorators(
  ApiOperation({ operationId: 'getRegistration' }), ApiParam({ name: 'registrationId', format: 'uuid' }),
  ApiResponse({ status: 200, description: 'Current user summary for the registration.', schema: userSummarySchema }), Problems(400, 401, 403, 404, 503)); }
export function RegistrationTransitionApi(activate: boolean): ReturnType<typeof applyDecorators> { return applyDecorators(
  ApiOperation({ operationId: activate ? 'activatePendingUser' : 'cancelPendingUser' }), ApiParam({ name: 'registrationId', format: 'uuid' }),
  ApiResponse(activate ? { status: 200, description: 'User ACTIVE; replay is idempotent.', schema: userSummarySchema } : { status: 204, description: 'Pending user cancelled; replay is idempotent.' }), Problems(400, 401, 403, 404, 409, 503)); }
