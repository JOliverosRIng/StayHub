import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
export function createSearchOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder().setTitle('StayHub Search Service').setVersion('1.0.0').addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'Service-JWT' }, 'serviceAuth').build();
  return SwaggerModule.createDocument(app, config);
}
