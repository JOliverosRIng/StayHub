import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

// Swagger 8 emits nullable from decorators; OpenAPI 3.1 uses JSON Schema null types.
function openApi31(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(openApi31);
  if (!value || typeof value !== 'object') return value;
  const schema = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, openApi31(item)]));
  if (schema.nullable === true && typeof schema.type === 'string') schema.type = [schema.type, 'null'];
  delete schema.nullable;
  return schema;
}
export function createSearchOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('StayHub Search Service Internal API')
    .setDescription('API interna de búsqueda sobre una proyección local. No representa detalle ni disponibilidad autoritativa.')
    .setVersion('1.0.0')
    .addServer('http://search-service:3004')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'Service-JWT' }, 'serviceAuth')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.openapi = '3.1.0';
  return openApi31(document) as OpenAPIObject;
}
