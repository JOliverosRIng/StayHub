import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { PAYMENTS_OPENAPI_SCHEMAS } from './schemas';

const SERVICE_JWT_DESCRIPTION = 'JWT RS256 de servicio (issuer `stayhub-bookings-service`, audience `stayhub-payments-service`) con scopes `payments:charge`, `payments:refund`, `payments:read`.';
const USER_JWT_DESCRIPTION = 'Access JWT RS256 emitido por Auth (issuer `https://auth.stayhub.internal`, audience `stayhub-api`). Roles `GUEST`, `OWNER`, `ADMIN`.';

export function createPaymentsOpenApi(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('StayHub Payments Service')
    .setVersion('1.0.0')
    .setDescription('Cobros, reembolsos y consulta de estado de transacciones.\nLa pasarela de pago es simulada (mock) con ledger recuperable de desarrollo/pruebas. No se reciben datos de tarjeta, solo un token opaco.\nErrores en `application/problem+json`. Contrato INTERNO: Payments no está publicado en Gateway en este incremento; los usuarios finales no acceden directamente a este puerto.\n')
    .addServer('http://payments-service:3006', 'Red interna Docker')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: SERVICE_JWT_DESCRIPTION }, 'serviceJwt')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: USER_JWT_DESCRIPTION }, 'userJwt')
    .build();
  const document = SwaggerModule.createDocument(app, options);
  document.openapi = '3.1.0';
  if (document.info.contact && Object.keys(document.info.contact).length === 0) delete document.info.contact;
  document.tags = [{ name: 'Payments' }, { name: 'Refunds' }, { name: 'Health' }];
  document.security = [{ serviceJwt: [] }];
  document.components = {
    ...document.components,
    schemas: PAYMENTS_OPENAPI_SCHEMAS as unknown as Record<string, SchemaObject>,
  };
  for (const path of ['/health/live', '/health/ready']) {
    const operation = document.paths[path]?.get;
    if (operation) operation.security = [];
  }
  return document;
}
