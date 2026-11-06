import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { authApp } from '../fixtures/auth-app.fixture';
import { bearer, forgeToken, validClaims, validHeader } from '../fixtures/config.fixture';

describe('ACC-013 OWNER-only mutations over HTTP', () => {
  let app: INestApplication; let server: Server;
  beforeAll(async () => { ({ app, server } = await authApp()); });
  afterAll(async () => { await app.close(); });

  it('allows OWNER', async () => {
    await request(server).post('/probe/owner').set('Authorization', bearer(undefined, 'OWNER')).expect(200);
  });

  it.each(['GUEST', 'ADMIN'] as const)('denies authenticated %s with 403 FORBIDDEN', async (role) => {
    const res = await request(server).post('/probe/owner').set('Authorization', bearer(undefined, role)).expect(403).expect('Content-Type', /application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 403, code: 'FORBIDDEN', errors: [] });
  });

  it('authenticates before authorising: an invalid OWNER token is 401, not 403', async () => {
    await request(server).post('/probe/owner').set('Authorization', `Bearer ${forgeToken(validHeader(), validClaims(), 'foreign-key')}`).expect(401);
  });
});
