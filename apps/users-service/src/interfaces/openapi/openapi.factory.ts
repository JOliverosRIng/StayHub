import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
export function createOpenApi(app: INestApplication): OpenAPIObject {
  const serverUrl = process.env.USERS_SWAGGER_SERVER_URL?.trim() || 'http://users-service:3002';
  const config = new DocumentBuilder().setTitle('StayHub Users Service API').setVersion('1.0.0')
    .setDescription('Internal REST API; users-service owns identity, role and profile data.')
    .addServer(serverUrl)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearerAuth')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'Service-JWT' }, 'serviceAuth').build();
  const document = SwaggerModule.createDocument(app, config);
  const patch = document.paths['/internal/v1/users/{userId}/profile']?.patch?.requestBody;
  if (patch && 'content' in patch && patch.content['multipart/form-data']) patch.content['multipart/form-data'].encoding = { profile: { contentType: 'application/json' }, photo: { contentType: 'image/jpeg, image/png' } };
  return document;
}
