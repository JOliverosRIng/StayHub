import { Test } from '@nestjs/testing';
import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { USERS_CONFIG } from '../../src/infrastructure/config/users-config';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { UsersLogger } from '../../src/infrastructure/logging/users-logger';
import { pendingFixture, serviceToken, testConfig } from '../fixtures/users.fixture';
describe('USR-026 service authentication before persistence', () => {
  let app: INestApplication; const create = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(USERS_CONFIG).useValue(testConfig('postgresql://users:synthetic@localhost/users_db')).overrideProvider(PrismaService).useValue({ user: { create }, $transaction: jest.fn() }).compile();
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
});
