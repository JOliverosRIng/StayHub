import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { USERS_CONFIG } from '../../src/infrastructure/config/users-config';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { UsersLogger } from '../../src/infrastructure/logging/users-logger';
import { userToken, testConfig, accessKeys } from '../fixtures/users.fixture';
describe('USR-061 JWT adversarial tests before persistence', () => {
  let app: INestApplication; const findFirst = jest.fn(); const id = randomUUID();
  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(USERS_CONFIG).useValue(testConfig('postgresql://users:synthetic@localhost/users_db')).overrideProvider(PrismaService).useValue({ user: { findFirst } }).compile(); app = module.createNestApplication({ logger: false }); configureHttp(app, new UsersLogger(() => undefined)); await app.init(); });
  afterAll(async () => { await app?.close(); });
  const claims = { sub: id, sid: randomUUID(), jti: randomUUID(), role: 'GUEST', iss: 'test-auth', aud: 'test-api', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
  const tokens = [
    sign(claims, '', { algorithm: 'none' }),
    sign(claims, 'synthetic-secret', { algorithm: 'HS256', keyid: 'access-v1' }),
    sign(claims, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, { algorithm: 'RS256', keyid: 'access-v1' }),
    sign(claims, accessKeys.privateKey, { algorithm: 'RS256', keyid: 'unknown' }),
    ...[{ iss: 'wrong' }, { aud: 'wrong' }, { exp: 1 }, { sub: undefined }, { sid: undefined }, { sub: id.toUpperCase() }, { sid: 'invalid' }, { role: 'SUPERADMIN' }].map((overrides) => userToken(id, overrides)),
  ];
  it.each(tokens.map((token, i) => [i, token] as const))('rejects adversarial case %i', async (_i, token) => { await request(app.getHttpServer() as Server).get(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${token}`).expect(401); expect(findFirst).not.toHaveBeenCalled(); });
  it('does not accept identity headers', async () => { await request(app.getHttpServer() as Server).get(`/internal/v1/users/${id}/profile`).set('x-user-id', id).set('x-user-role', 'ADMIN').expect(401); expect(findFirst).not.toHaveBeenCalled(); });
});
