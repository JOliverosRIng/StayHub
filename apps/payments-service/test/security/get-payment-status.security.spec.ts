import { Test } from '@nestjs/testing';
import type { INestApplication, Type } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PaymentsController } from '../../src/interfaces/http/payments/payments.controller';
import { GetPaymentStatus } from '../../src/application/payments/get-payment-status.use-case';
import { ServiceAuthGuard } from '../../src/interfaces/http/guards/service-auth.guard';
import { JwtStrategy } from '../../src/interfaces/http/auth/jwt.strategy';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import { createTestJwtFixture } from '../fixtures/jwt.fixture';

const serviceJwt = createTestJwtFixture({ issuer: 'stayhub-bookings-service', audience: 'stayhub-payments-service' });
const userJwt = createTestJwtFixture({ issuer: 'stayhub-auth', audience: 'stayhub-api' });
const config = {
  serviceJwt: serviceJwt.config,
  userJwt: userJwt.config,
  chargeScope: 'payments:charge',
  refundScope: 'payments:refund',
  readScope: 'payments:read',
} as unknown as PaymentsConfig;
const paymentId = '56ac8df3-4ab6-48d2-8248-37ec830c9131';

describe('GET /payments/:id/status security', () => {
  let app: INestApplication;
  const execute = jest.fn();
  const serviceToken = (scope: string): string => serviceJwt.signToken({ sub: 'bookings-service', scope });
  const userToken = (sub: string, role: string): string => userJwt.signToken({
    sub, role, sid: 'c23c61c8-1ccb-4c3f-932b-b62505420aae', jti: 'b73958c2-2ecb-46a2-bc93-b1cba20f9898',
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentsController as unknown as Type<unknown>],
      providers: [
        { provide: GetPaymentStatus, useValue: { execute } },
        { provide: PAYMENTS_CONFIG, useValue: config },
        ServiceAuthGuard,
        JwtStrategy,
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => execute.mockReset().mockResolvedValue({ paymentId, status: 'PENDING' }));

  it('accepts the owning user and an ADMIN user', async () => {
    for (const token of [userToken('b73958c2-2ecb-46a2-bc93-b1cba20f9898', 'GUEST'), userToken('c73958c2-2ecb-46a2-bc93-b1cba20f9898', 'ADMIN')]) {
      await request(app.getHttpServer() as Server).get(`/payments/${paymentId}/status`).set('Authorization', `Bearer ${token}`).expect(200);
    }
  });

  it('accepts a service with payments:read and forbids another service scope', async () => {
    await request(app.getHttpServer() as Server).get(`/payments/${paymentId}/status`).set('Authorization', `Bearer ${serviceToken('payments:read')}`).expect(200);
    await request(app.getHttpServer() as Server).get(`/payments/${paymentId}/status`).set('Authorization', `Bearer ${serviceToken('payments:charge')}`).expect(403);
  });

  it('returns indistinguishable 404 responses for a foreign and absent payment', async () => {
    const token = userToken('c73958c2-2ecb-46a2-bc93-b1cba20f9898', 'GUEST');
    const foreign = await request(app.getHttpServer() as Server).get(`/payments/${paymentId}/status`).set('Authorization', `Bearer ${token}`).expect(404);
    const absent = await request(app.getHttpServer() as Server).get('/payments/56ac8df3-4ab6-48d2-8248-37ec830c9132/status').set('Authorization', `Bearer ${token}`).expect(404);
    expect(absent.body).toEqual(foreign.body);
  });

  it('rejects malformed payment IDs with 400', async () => {
    await request(app.getHttpServer() as Server).get('/payments/not-a-uuid/status').set('Authorization', `Bearer ${userToken('b73958c2-2ecb-46a2-bc93-b1cba20f9898', 'GUEST')}`).expect(400);
  });
});
