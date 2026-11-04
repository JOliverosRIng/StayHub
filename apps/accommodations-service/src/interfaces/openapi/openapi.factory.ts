import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
export function createOpenApi(app: INestApplication): OpenAPIObject {
  const serverUrl = process.env.ACCOMMODATIONS_SWAGGER_SERVER_URL?.trim() || 'http://accommodations-service:3003';
  const config = new DocumentBuilder().setTitle('StayHub Accommodations Service API').setVersion('1.0.0')
    .setDescription('Internal REST API; accommodations-service owns properties, rooms, features and photo metadata.')
    .addServer(serverUrl)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT (RS256)' }, 'bearerAuth').build();
  return SwaggerModule.createDocument(app, config);
}
