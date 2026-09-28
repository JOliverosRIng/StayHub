import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

export function createAuthOpenApi(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('StayHub Auth Service API')
    .setDescription('Internal Auth API. Port 3001 is not publicly exposed.')
    .setVersion('1.0.0')
    .addServer('http://auth-service:3001')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'Service-JWT' },
      'serviceAuth',
    )
    .build();
  return SwaggerModule.createDocument(app, options);
}

export function mountAuthSwagger(app: INestApplication, environment: string): void {
  if (environment === 'development') SwaggerModule.setup('docs', app, createAuthOpenApi(app));
}

