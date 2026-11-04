import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
export function ApiSearch(): MethodDecorator {
  return applyDecorators(ApiBearerAuth('serviceAuth'), ApiOperation({ summary: 'Search published accommodation projections' }), ApiResponse({ status: 200, description: 'Paginated search results; availability is projected when dates are used.' }), ApiResponse({ status: 400, description: 'Invalid filters (Problem Details).' }), ApiResponse({ status: 401, description: 'Invalid service JWT.' }), ApiResponse({ status: 403, description: 'Insufficient service scope.' }), ApiResponse({ status: 503, description: 'Authoritative dependency unavailable.' }));
}
