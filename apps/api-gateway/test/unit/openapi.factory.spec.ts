import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import YAML from 'yaml';

import {
  IDEMPOTENCY_KEY_PARAMETER,
  PHOTO_MAX_BYTES,
  PUBLIC_SERVER_URL,
  buildPublicOpenApi,
  multipartRequestBody,
  problemResponse,
  securityFor,
} from '@gateway/interfaces/openapi/openapi.factory';
import { createTestGatewayConfig } from '../support/gateway-config-fixture';

type Node = Record<string, unknown>;

const CONTRACT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'specs',
  '001-fundamentos-identidad',
  'contracts',
  'openapi-public.yaml',
);

const record = (value: unknown): Node => (value ?? {}) as Node;

const contract = (): Node =>
  record(YAML.parse(readFileSync(CONTRACT, 'utf8')) as unknown);

const document = (): Node => buildOpenApi();

const buildOpenApi = (env: Record<string, string> = {}): Node =>
  buildPublicOpenApi(createTestGatewayConfig(env).config) as unknown as Node;

const group = (doc: Node, name: string): Record<string, Node> =>
  record(record(doc['components'])[name]) as Record<string, Node>;

const CANONICAL = ['type', 'title', 'status', 'detail', 'instance', 'code', 'traceId'];

describe('buildPublicOpenApi (GW-021)', () => {
  it('declara la version de OpenAPI que exige el contrato', () => {
    expect(document()['openapi']).toBe('3.0.3');
    expect(document()['openapi']).toBe(contract()['openapi']);
  });

  it('usa el titulo y la version del contrato publico', () => {
    const expected = record(contract()['info']);

    expect(record(document()['info'])['title']).toBe(expected['title']);
    expect(record(document()['info'])['version']).toBe(expected['version']);
  });

  it('declara un unico servidor con la URL de D1', () => {
    const servers = document()['servers'] as { url: string }[];

    expect(servers).toHaveLength(1);
    expect(servers[0]?.url).toBe(PUBLIC_SERVER_URL);
    expect(servers[0]?.url).toBe('https://localhost:8080/api/v1');
  });

  it('respeta el servidor configurado para despliegues reales', () => {
    const doc = buildOpenApi({ GATEWAY_SWAGGER_SERVER_URL: 'https://api.stayhub.example/api/v1' });

    expect((doc['servers'] as { url: string }[])[0]?.url).toBe(
      'https://api.stayhub.example/api/v1',
    );
  });

  it('rechaza un servidor configurado que no sea https', () => {
    expect(() => buildOpenApi({ GATEWAY_SWAGGER_SERVER_URL: 'http://api.stayhub.example' }))
      .toThrow(/https/);
  });

  it('declara el esquema de autenticacion por bearer tal como el contrato', () => {
    const expected = record(record(contract()['components'])['securitySchemes'])['bearerAuth'];
    const actual = group(document(), 'securitySchemes')['bearerAuth'];

    expect(record(actual)['type']).toBe('http');
    expect(record(actual)['scheme']).toBe('bearer');
    expect(record(actual)['bearerFormat']).toBe('JWT');
    expect(actual).toEqual(expected);
  });

  it('declara la cookie de refresh tal como el contrato', () => {
    const expected = record(record(contract()['components'])['securitySchemes'])['refreshCookie'];
    const actual = group(document(), 'securitySchemes')['refreshCookie'];

    expect(record(actual)['type']).toBe('apiKey');
    expect(record(actual)['in']).toBe('cookie');
    expect(record(actual)['name']).toBe('stayhub_refresh');
    expect(actual).toEqual(expected);
  });

  it('expone las dos alternativas de credencial en security', () => {
    expect(securityFor(['bearerAuth'])).toEqual([{ bearerAuth: [] }]);
    expect(securityFor(['bearerAuth', 'refreshCookie'])).toEqual([
      { bearerAuth: [] },
      { refreshCookie: [] },
    ]);
  });

  it('exige los siete campos canonicos en el esquema Problem', () => {
    expect(group(document(), 'schemas')['Problem']?.['required']).toEqual(CANONICAL);
  });

  it('modela type de Problem como uri-reference', () => {
    const properties = record(group(document(), 'schemas')['Problem']?.['properties']);

    expect(properties['type']).toEqual({ type: 'string', format: 'uri-reference' });
  });

  it('modela errors como FieldError y no como string', () => {
    const properties = record(group(document(), 'schemas')['Problem']?.['properties']);
    const items = record(record(properties['errors'])['items']);

    expect(items['$ref']).toBe('#/components/schemas/FieldError');
    expect(items['type']).toBeUndefined();
  });

  it('declara el esquema FieldError con field y code obligatorios', () => {
    expect(group(document(), 'schemas')['FieldError']?.['required']).toEqual(['field', 'code']);
  });

  it('resuelve el $ref de errors dentro del propio documento', () => {
    const properties = record(group(document(), 'schemas')['Problem']?.['properties']);
    const ref = record(record(properties['errors'])['items'])['$ref'] as string;

    expect(ref.startsWith('#/components/schemas/')).toBe(true);
    expect(group(document(), 'schemas')[ref.split('/').pop() as string]).toBeDefined();
  });

  it.each([
    ['BadRequest', 400],
    ['Unauthorized', 401],
    ['Forbidden', 403],
    ['NotFound', 404],
    ['Conflict', 409],
    ['PayloadTooLarge', 413],
    ['UnsupportedMediaType', 415],
    ['TooManyRequests', 429],
    ['Unavailable', 503],
  ])('declara la respuesta %s como application/problem+json (%i)', (name, status) => {
    const response = group(document(), 'responses')[name];
    const content = record(response?.['content']);

    expect(content['application/problem+json']).toEqual({
      schema: { $ref: '#/components/schemas/Problem' },
    });
    expect(problemResponse(status)['description']).toBe(response?.['description']);
  });

  it('expone el mismo conjunto de respuestas que el contrato', () => {
    expect(Object.keys(group(document(), 'responses')).sort()).toEqual(
      Object.keys(record(record(contract()['components'])['responses'])).sort(),
    );
  });

  it('documenta Retry-After en la respuesta de limite de peticiones', () => {
    const headers = record(group(document(), 'responses')['TooManyRequests']?.['headers']);

    expect(headers['Retry-After']).toBeDefined();
  });

  it('declara el parametro Idempotency-Key como exige el contrato', () => {
    const parameter = group(document(), 'parameters')['IdempotencyKey'];

    expect(parameter?.['name']).toBe('Idempotency-Key');
    expect(parameter?.['in']).toBe('header');
    expect(parameter?.['required']).toBe(true);
    expect(parameter).toEqual({ ...IDEMPOTENCY_KEY_PARAMETER });
  });

  it('expone el limite de foto pactado en la configuracion', () => {
    expect(PHOTO_MAX_BYTES(createTestGatewayConfig().config)).toBe(5000000);
  });

  it('describe la subida de foto como multipart con un campo binario', () => {
    const content = record(multipartRequestBody()['content']);
    const schema = record(record(content['multipart/form-data'])['schema']);
    const properties = record(schema['properties']);

    expect(Object.keys(content)).toEqual(['multipart/form-data']);
    expect(properties['photo']).toEqual({ type: 'string', format: 'binary' });
    expect(schema['required']).toEqual(['photo']);
  });

  it('declara las mismas etiquetas que el contrato', () => {
    const names = (doc: Node): string[] =>
      (doc['tags'] as { name: string }[] | undefined)?.map((tag) => tag.name) ?? [];

    expect(names(document())).toEqual(names(contract()));
  });

  it('declara un paths vacio hasta que existan los controladores', () => {
    expect(Object.keys(record(document()['paths']))).toEqual([]);
  });
});
