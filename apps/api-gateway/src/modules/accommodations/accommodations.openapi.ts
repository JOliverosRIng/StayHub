import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * Documentación Swagger de las rutas de alojamientos del Gateway. Los esquemas detallados de
 * cuerpo y respuesta son los del contrato de Accommodations
 * (`specs/002-alojamientos/contracts`); el Gateway los reenvía sin transformarlos.
 */

const TAG = 'Accommodations';
const PROBLEM = { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } };
const PROPERTY_ID = ApiParam({ name: 'propertyId', schema: { type: 'string', format: 'uuid' } });
const JSON_OBJECT = { type: 'object', description: 'Representación definida por el contrato de Accommodations.' };

function problem(status: number, description: string): MethodDecorator & ClassDecorator {
  return ApiResponse({ status, description, content: PROBLEM });
}

export function CreatePropertyApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'createProperty', summary: 'Create a draft property (OWNER)' }),
    ApiBearerAuth('bearerAuth'),
    ApiBody({ schema: JSON_OBJECT }),
    ApiResponse({ status: 201, description: 'Property created as DRAFT.', schema: JSON_OBJECT }),
    problem(400, 'Invalid payload.'), problem(401, 'Invalid authentication.'),
    problem(403, 'Only an OWNER may create properties.'), problem(503, 'Accommodations is unavailable.'),
  );
}

export function GetPropertyApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'getProperty', summary: 'Get a visible property (anonymous or owner)' }),
    ApiBearerAuth('bearerAuth'),
    PROPERTY_ID,
    ApiResponse({ status: 200, description: 'Property detail.', schema: JSON_OBJECT }),
    problem(400, 'Invalid property id.'), problem(401, 'A bearer was sent but it is invalid.'),
    problem(404, 'Property not found or not visible.'), problem(503, 'Accommodations is unavailable.'),
  );
}

export function ReplacePropertyApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'replaceProperty', summary: 'Replace the editable representation of an owned property' }),
    ApiBearerAuth('bearerAuth'),
    PROPERTY_ID,
    ApiBody({ schema: JSON_OBJECT }),
    ApiResponse({ status: 200, description: 'Updated property.', schema: JSON_OBJECT }),
    problem(400, 'Invalid payload.'), problem(401, 'Invalid authentication.'), problem(403, 'Not an OWNER.'),
    problem(404, 'Property not found or not owned.'), problem(409, 'Version or state conflict.'),
    problem(503, 'Accommodations is unavailable.'),
  );
}

export function AddPropertyPhotoApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'addPropertyPhoto', summary: 'Upload a photo for an owned property' }),
    ApiBearerAuth('bearerAuth'),
    PROPERTY_ID,
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['file'],
        properties: { file: { type: 'string', format: 'binary', description: 'JPEG, PNG or WebP up to 5,000,000 bytes.' } },
      },
    }),
    ApiResponse({ status: 201, description: 'Photo metadata.', schema: JSON_OBJECT }),
    problem(400, 'Missing or invalid file.'), problem(401, 'Invalid authentication.'), problem(403, 'Not an OWNER.'),
    problem(404, 'Property not found or not owned.'), problem(409, 'Photo limit reached.'),
    problem(413, 'Photo exceeds 5,000,000 bytes.'), problem(415, 'Unsupported photo type.'),
    problem(503, 'Accommodations is unavailable.'),
  );
}
