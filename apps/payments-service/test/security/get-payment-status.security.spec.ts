import { Test } from '@nestjs/testing';
import type { INestApplication, Type } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PaymentsController } from '../../src/interfaces/http/payments/payments.controller';
import { GetPaymentStatus } from '../../src/application/payments/get-payment-status.use-case';
import { CreatePayment } from '../../src/application/payments/create-payment.use-case';
import { PaymentReadAuthGuard } from '../../src/interfaces/http/guards/payment-read-auth.guard';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import { createTestJwtFixture } from '../fixtures/jwt.fixture';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import type { PaymentStatusRecord } from '../../src/application/ports/payment-status.reader';

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
  const useCase = new GetPaymentStatus({
    findStatusById: (id: string): Promise<PaymentStatusRecord | null> => Promise.resolve(id === paymentId ? {
      paymentId,
      bookingId: 'c23c61c8-1ccb-4c3f-932b-b62505420aae',
      payerUserId: 'b73958c2-2ecb-46a2-bc93-b1cba20f9898',
      amountMinor: 35_000_000,
      currency: 'COP',
      status: 'PENDING',
      refundedAmountMinor: 0,
      failureCode: null,
      updatedAt: new Date('2026-11-07T12:00:00.000Z'),
    } : null),
  });

describe('GET /payments/:id/status security', () => {
  let app: INestApplication;
  const serviceToken = (scope: string): string => serviceJwt.signToken({ sub: 'bookings-service', scope });
  const userToken = (sub: string, role: string): string => userJwt.signToken({
    sub, role, sid: 'c23c61c8-1ccb-4c3f-932b-b62505420aae', jti: 'b73958c2-2ecb-46a2-bc93-b1cba20f9898',
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentsController as unknown as Type<unknown>],
      providers: [
        { provide: CreatePayment, useValue: { execute: jest.fn() } },
        { provide: GetPaymentStatus, useValue: useCase },
        { provide: PAYMENTS_CONFIG, useValue: config },
        PaymentReadAuthGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => jest.clearAllMocks());

  it('accepts the owning user and an ADMIN user', async () => {
    for (const token of [userToken('b73958c2-2ecb-46a2-bc93-b1cba20f9898', 'GUEST'), userToken('c73958c2-2ecb-46a2-bc93-b1cba20f9898', 'ADMIN')]) {
      const response = await request(app.getHttpServer() as Server).get(`/payments/${paymentId}/status`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).not.toHaveProperty('gatewayReference');
      expect(response.body).not.toHaveProperty('paymentMethodFingerprint');
      expect(response.body).not.toHaveProperty('token');
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
    const stableBody = (body: Record<string, unknown>): Record<string, unknown> => {
      const { traceId, instance, ...stable } = body;
      void traceId;
      void instance;
      return stable;
    };
    expect(stableBody(absent.body as Record<string, unknown>)).toEqual(stableBody(foreign.body as Record<string, unknown>));
  });

  it('rejects malformed payment IDs with 400', async () => {
    await request(app.getHttpServer() as Server).get('/payments/not-a-uuid/status').set('Authorization', `Bearer ${userToken('b73958c2-2ecb-46a2-bc93-b1cba20f9898', 'GUEST')}`).expect(400);
  });
});
