import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

export const PUBLIC_SERVER_URL = 'https://localhost:8080/api/v1';
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
const PROBLEM_SCHEMA_REF = '#/components/schemas/Problem';
const CANONICAL_PROBLEM_FIELDS = [
  'type',
  'title',
  'status',
  'detail',
  'instance',
  'code',
  'traceId',
] as const;

const PROBLEM_DESCRIPTIONS: Readonly<Record<number, string>> = {
  400: 'Invalid or unknown input; no changes applied.',
  401: 'Missing or invalid authentication; login errors remain generic.',
  403: 'Authenticated but not authorized for the target.',
  404: 'Own requested resource is absent.',
  409: 'Email, version or idempotency conflict; no changes applied.',
  413: 'Request or photo exceeds configured size.',
  415: 'Photo is not a valid JPEG or PNG.',
  429: 'Registration or login rate limit exceeded without revealing account existence.',
  503: 'A required downstream service is unavailable; retry with the same idempotency key.',
};

export const IDEMPOTENCY_KEY_PARAMETER = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  description: 'Client-generated UUID that makes a retried write safe to repeat.',
  schema: { type: 'string', format: 'uuid' },
} as const;

interface ProblemResponse {
  description: string;
  content: Record<string, { schema: { $ref: string } }>;
  headers?: Record<string, { description: string; schema: { type: string; minimum: number } }>;
}

export function problemResponse(status: number): ProblemResponse {
  return {
    description: PROBLEM_DESCRIPTIONS[status] ?? 'Unexpected gateway error.',
    content: { [PROBLEM_CONTENT_TYPE]: { schema: { $ref: PROBLEM_SCHEMA_REF } } },
  };
}

export function tooManyRequestsResponse(): ProblemResponse {
  return {
    ...problemResponse(429),
    headers: {
      'Retry-After': {
        description: 'Seconds until this request may be retried.',
        schema: { type: 'integer', minimum: 1 },
      },
    },
  };
}

export function securityFor(
  names: readonly ('bearerAuth' | 'refreshCookie')[],
): { bearerAuth: never[]; refreshCookie: never[] }[] {
  return names.map((name) => ({ [name]: [] }) as { bearerAuth: never[]; refreshCookie: never[] });
}

export function PHOTO_MAX_BYTES(config: GatewayConfig): number {
  return config.maxPhotoBytes;
}

export function multipartRequestBody(): Record<string, unknown> {
  return {
    required: true,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: ['photo'],
          properties: { photo: { type: 'string', format: 'binary' } },
        },
      },
    },
  };
}

export function buildPublicOpenApi(config: GatewayConfig): OpenAPIObject {
  const serverUrl = config.swaggerServerUrl ?? PUBLIC_SERVER_URL;
  if (!serverUrl.startsWith('https://')) {
    throw new Error('Public OpenAPI server url must use https');
  }
  const options = new DocumentBuilder()
    .setTitle('StayHub Identity Public API')
    .setDescription('Public HTTPS contract exposed by the NestJS API Gateway.')
    .setVersion('1.0.0')
    .setOpenAPIVersion('3.0.3')
    .addServer(serverUrl)
    .addTag('Authentication', 'Public registration, session lifecycle and token validation.')
    .addTag('Profile', 'Authenticated profile reads, edits and photo download.')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearerAuth')
    .addApiKey({ type: 'apiKey', in: 'cookie', name: 'stayhub_refresh' }, 'refreshCookie')
    .build();
  return {
    ...options,
    paths: {},
    servers: [{ url: serverUrl }],
    security: securityFor(['bearerAuth', 'refreshCookie']),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        refreshCookie: { type: 'apiKey', in: 'cookie', name: 'stayhub_refresh' },
      },
      parameters: { IdempotencyKey: { ...IDEMPOTENCY_KEY_PARAMETER } },
      schemas: {
        Problem: {
          type: 'object',
          required: [...CANONICAL_PROBLEM_FIELDS],
          properties: {
            type: { type: 'string', format: 'uri-reference' },
            title: { type: 'string' },
            status: { type: 'integer' },
            detail: { type: 'string' },
            instance: { type: 'string' },
            code: { type: 'string' },
            traceId: { type: 'string' },
            errors: { type: 'array', items: { $ref: '#/components/schemas/FieldError' } },
          },
        },
        FieldError: {
          type: 'object',
          required: ['field', 'code'],
          properties: {
            field: { type: 'string' },
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
      responses: {
        BadRequest: problemResponse(400),
        Unauthorized: problemResponse(401),
        Forbidden: problemResponse(403),
        NotFound: problemResponse(404),
        Conflict: problemResponse(409),
        PayloadTooLarge: problemResponse(413),
        UnsupportedMediaType: problemResponse(415),
        TooManyRequests: tooManyRequestsResponse(),
        Unavailable: problemResponse(503),
      },
    },
  };
}

export function mountPublicSwagger(
  app: INestApplication,
  config: GatewayConfig,
  environment: string,
): OpenAPIObject {
  const base = buildPublicOpenApi(config);
  if (environment !== 'development') return base;
  const generated = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  const document: OpenAPIObject = {
    ...generated,
    ...base,
    // `base.paths` está vacío: se conservan las rutas generadas desde los controladores.
    paths: generated.paths,
    components: { ...generated.components, ...base.components },
    servers: base.servers ?? [],
    security: base.security ?? [],
  };
  SwaggerModule.setup('docs', app, document);
  return document;
}
