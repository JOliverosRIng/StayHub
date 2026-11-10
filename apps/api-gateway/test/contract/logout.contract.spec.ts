import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import YAML from 'yaml';
import { LogoutController } from '@gateway/modules/auth/logout.controller';
import { RefreshCookieService } from '@gateway/modules/auth/refresh-cookie.service';
import { mountPublicSwagger } from '@gateway/interfaces/openapi/openapi.factory';
import { createTestGatewayConfig } from '../support/gateway-config-fixture';
import { GATEWAY_CONFIG } from '@gateway/infrastructure/config/gateway-config';

describe('browser logout', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [LogoutController], providers: [RefreshCookieService, { provide: GATEWAY_CONFIG, useValue: { apiPrefix: '/api/v1' } }] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('/api/v1'); await app.init();
  });
  afterAll(async () => { await app.close(); });
  it('clears the exact cookie without requiring Auth, including repeated calls', async () => {
    for (let n = 0; n < 2; n++) {
      const response = await request(app.getHttpServer() as Server).post('/api/v1/auth/logout').expect(204);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies[0]).toContain('stayhub_refresh=;');
      expect(cookies[0]).toContain('Path=/api/v1/auth/refresh');
      expect(cookies[0]).toContain('HttpOnly'); expect(cookies[0]).toContain('Secure'); expect(cookies[0]).toContain('SameSite=Strict');
      expect(cookies[0]).toContain('Expires=Thu, 01 Jan 1970'); expect(response.text).toBe('');
    }
  });
  it('mounts logout in development Swagger without losing generated paths or duplicating the API prefix', () => {
    const doc = mountPublicSwagger(app, createTestGatewayConfig().config, 'development');
    expect(doc.paths['/auth/logout']?.post?.operationId).toBe('logout');
    expect(doc.paths['/auth/logout']?.post?.security).toEqual([]);
    expect(doc.paths['/api/v1/auth/logout']).toBeUndefined();
    expect(doc.paths['/auth/logout']?.post?.responses['204']).toBeDefined();
  });
  it('documents anonymous idempotent logout with no body', () => {
    const doc = YAML.parse(readFileSync(resolve(__dirname, '../../../../specs/001-fundamentos-identidad/contracts/openapi-public.yaml'), 'utf8')) as { paths: Record<string, { post: { security: unknown[]; requestBody?: unknown; responses: Record<string, unknown> } }> };
    const operation = doc.paths['/auth/logout']!.post;
    expect(operation.security).toEqual([]); expect(operation.requestBody).toBeUndefined(); expect(Object.keys(operation.responses)).toEqual(['204']);
  });
});
