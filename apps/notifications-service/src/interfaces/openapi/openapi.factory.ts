import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

export function createNotificationsOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('StayHub Notifications Service')
    .setDescription('Internal API for notification submission, booking confirmation/reminder scheduling, and owner/admin history. Email uses a local fake adapter.')
    .setVersion('1.0.0')
    .addServer('http://localhost:3009', 'Local service port')
    .addTag('Notifications')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT (RS256)', description: 'Access JWT: ADMIN send; owner/admin read.' }, 'accessJwt')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'Service-JWT (RS256)', description: 'Service token with the configured notifications send scope.' }, 'serviceJwt')
    .build();
  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controller, method): string => method === 'send' ? 'sendNotification' : method === 'list' ? 'listUserNotifications' : method,
  });
}
