import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiQuery, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { Problem, SearchResponse } from './search.responses';
export function ApiSearch(): MethodDecorator {
  return applyDecorators(
    ApiBearerAuth('serviceAuth'),
    ApiExtraModels(Problem, SearchResponse),
    ApiQuery({ name: 'amenities', required: false, style: 'form', explode: true, description: 'Amenidades normalizadas; el alojamiento debe contener todas.', schema: { type: 'array', maxItems: 20, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 60 } } }),
    ApiOperation({ operationId: 'searchAccommodations', summary: 'Buscar alojamientos publicados', description: 'Todos los filtros se combinan mediante AND. Solo devuelve un resumen con accommodationId, no la ficha completa de RQ-06. Las fechas usan disponibilidad PROJECTED, nunca autoritativa. Sin texto, orden por accommodationId; con texto, relevancia y desempate por accommodationId. Service JWT RS256 con issuer/audience/kid y scope de Search configurados.' }),
    ApiResponse({ status: 200, description: 'Página de resultados resumidos.', type: SearchResponse }),
    ...([ [400, 'Solicitud inválida.'], [401, 'Service JWT ausente o inválido.'], [403, 'Scope de servicio insuficiente.'], [503, 'PostgreSQL u otra dependencia autoritativa no disponible.'] ] as const).map(([status, description]) => ApiResponse({ status, description, content: { 'application/problem+json': { schema: { $ref: getSchemaPath(Problem) } } } })),
  );
}
