import { Test } from '@nestjs/testing';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { USERS_CONFIG } from '../../src/infrastructure/config/users-config';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { Prisma } from '../../src/infrastructure/persistence/generated/prisma';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { UsersLogger } from '../../src/infrastructure/logging/users-logger';
import { pendingFixture, serviceToken, testConfig } from '../fixtures/users.fixture';
describe('USR-026 service authentication before persistence', () => {
  let app: INestApplication; const create = jest.fn(); const findUnique = jest.fn();
  beforeEach(() => { create.mockClear(); findUnique.mockClear(); });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(USERS_CONFIG).useValue(testConfig('postgresql://users:synthetic@localhost/users_db')).overrideProvider(PrismaService).useValue({ user: { create, findUnique }, $transaction: jest.fn() }).compile();
    app = module.createNestApplication({ logger: false }); configureHttp(app, new UsersLogger(() => undefined)); await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it('rejects a valid-shape service token signed by an untrusted RSA key', async () => {
    const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const token = sign({ iss: 'test-service', aud: 'test-users', scope: 'users:registration' }, key,
      { algorithm: 'RS256', keyid: 'service-v1', expiresIn: 120 });
    await request(app.getHttpServer() as Server).post('/internal/v1/registrations')
      .set('Authorization', `Bearer ${token}`).send(pendingFixture()).expect(401);
    expect(create).not.toHaveBeenCalled();
  });
  it.each([undefined, 'malformed', serviceToken('users:registration', { iss: 'wrong' }), serviceToken('users:registration', { aud: 'wrong' }), serviceToken('users:registration', { exp: 1 })])('rejects invalid token before repository', async (token) => {
    const req = request((app.getHttpServer() as Server)).post('/internal/v1/registrations'); if (token) req.set('Authorization', `Bearer ${token}`);
    await req.send(pendingFixture()).expect(401); expect(create).not.toHaveBeenCalled();
  });
  it('rejects wrong scope with 403', async () => { await request((app.getHttpServer() as Server)).post('/internal/v1/registrations').set('Authorization', `Bearer ${serviceToken('users:login-identity')}`).send(pendingFixture()).expect(403); expect(create).not.toHaveBeenCalled(); });
  it('rejects a read with a token signed by an untrusted RSA key before querying persistence', async () => {
    const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const token = sign({ iss: 'test-service', aud: 'test-users', scope: 'users:registration' }, key,
      { algorithm: 'RS256', keyid: 'service-v1', expiresIn: 120 });
    await request(app.getHttpServer() as Server).get(`/internal/v1/registrations/${randomUUID()}`)
      .set('Authorization', `Bearer ${token}`).expect(401);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it.each([undefined, 'malformed', serviceToken('users:registration', { iss: 'wrong' }), serviceToken('users:registration', { aud: 'wrong' }), serviceToken('users:registration', { exp: 1 })])('rejects an invalid read token before querying persistence', async (token) => {
    const req = request((app.getHttpServer() as Server)).get(`/internal/v1/registrations/${randomUUID()}`); if (token) req.set('Authorization', `Bearer ${token}`);
    await req.expect(401); expect(findUnique).not.toHaveBeenCalled();
  });
  it('rejects lookup-only scope on a read with 403 before querying persistence', async () => {
    await request((app.getHttpServer() as Server)).get(`/internal/v1/registrations/${randomUUID()}`)
      .set('Authorization', `Bearer ${serviceToken('users:login-identity')}`).expect(403);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('returns 503 instead of 404 when persistence is unavailable', async () => {
    findUnique.mockRejectedValueOnce(new Prisma.PrismaClientInitializationError('database unavailable', '6.19.0', 'P1001'));
    const response = await request((app.getHttpServer() as Server)).get(`/internal/v1/registrations/${randomUUID()}`)
      .set('Authorization', `Bearer ${serviceToken()}`).expect(503);
    expect((response.body as { code: string }).code).toBe('HTTP_503');
  });
});
