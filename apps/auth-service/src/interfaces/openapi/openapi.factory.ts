import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';

const CLOSED_SCHEMAS = [
  'RegisterCommand',
  'LoginCommand',
  'RotateRefreshCommand',
  'ValidateSessionCommand',
  'SessionValidation',
  'InternalTokenPair',
] as const;

export function createAuthOpenApi(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('StayHub Auth Service API')
    .setDescription('Internal Auth API. Port 3001 is not publicly exposed.')
    .setVersion('1.0.0')
    .setOpenAPIVersion('3.0.3')
    .addServer('http://auth-service:3001')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'Service-JWT' },
      'serviceAuth',
    )
    .build();
  const document = SwaggerModule.createDocument(app, options);
  closeContractSchemas(document);
  normalizeEnumScalarTypes(document);
  return document;
}

function closeContractSchemas(document: OpenAPIObject): void {
  const schemas = document.components?.schemas;
  if (schemas === undefined) return;
  const record = schemas as Record<string, unknown>;
  for (const name of CLOSED_SCHEMAS) {
    const schema = record[name];
    if (typeof schema === 'object' && schema !== null && !Array.isArray(schema)) {
      (schema as Record<string, unknown>).additionalProperties = false;
    }
  }
}

function normalizeEnumScalarTypes(document: OpenAPIObject): void {
  const schemas = document.components?.schemas;
  if (schemas === undefined) return;
  for (const schema of Object.values(schemas as Record<string, unknown>)) {
    normalizeEnumScalars(schema);
  }
}

function normalizeEnumScalars(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) normalizeEnumScalars(item);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  const values = record.enum;
  if (Array.isArray(values) && values.length > 0) {
    if (values.every((value) => typeof value === 'boolean')) record.type = 'boolean';
    else if (values.every((value) => typeof value === 'number' && Number.isInteger(value))) {
      record.type = 'integer';
    }
  }
  for (const value of Object.values(record)) normalizeEnumScalars(value);
}

export function mountAuthSwagger(app: INestApplication, environment: string): void {
  if (environment !== 'development') return;
  const config = app.get<AuthConfig>(AUTH_CONFIG);
  const document = createAuthOpenApi(app);
  document.servers = [
    { url: config.swaggerServerUrl ?? '/' },
    ...(document.servers ?? []),
  ];
  SwaggerModule.setup('docs', app, document);
}

