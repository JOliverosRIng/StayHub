import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import { PaymentsController } from '../../src/interfaces/http/payments/payments.controller';
import { CreatePayment } from '../../src/application/payments/create-payment.use-case';
import { ServiceAuthGuard } from '../../src/interfaces/http/guards/service-auth.guard';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import { PaymentsLogger } from '../../src/infrastructure/logging/payments-logger';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { createTestJwtFixture } from '../fixtures/jwt.fixture';
import { MOCK_GATEWAY_TOKENS } from '../fixtures/mock-gateway.fixture';

const serviceJwt = createTestJwtFixture({ issuer: 'stayhub-bookings-service', audience: 'stayhub-payments-service' });
const userJwt = createTestJwtFixture({ issuer: 'stayhub-auth', audience: 'stayhub-api' });
const config = {
  serviceJwt: serviceJwt.config,
  userJwt: userJwt.config,
  chargeScope: 'payments:charge',
  refundScope: 'payments:refund',
  readScope: 'payments:read',
} as unknown as PaymentsConfig;
const validBody = {
  bookingId: 'c23c61c8-1ccb-4c3f-932b-b62505420aae',
  payerUserId: 'b73958c2-2ecb-46a2-bc93-b1cba20f9898',
  amountMinor: 35_000_000,
  currency: 'COP',
  paymentMethod: { type: 'CARD_TOKEN', token: MOCK_GATEWAY_TOKENS.approved },
};
const idempotencyKey = '768c31dd-86be-4b28-90ea-e8d29efcab7a';

describe('POST /payments security', () => {
  let app: INestApplication;
  let execute: jest.Mock;
  const records: unknown[] = [];

  const token = (scope = 'payments:charge'): string => serviceJwt.signToken({
    sub: 'booking-service',
    scope,
  });

  beforeAll(async () => {
    execute = jest.fn().mockResolvedValue({ statusCode: 201, payment: { status: 'APPROVED' }, replayed: false });
    const module = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: CreatePayment, useValue: { execute } },
        { provide: PAYMENTS_CONFIG, useValue: config },
        ServiceAuthGuard,
        { provide: PaymentsLogger, useValue: new PaymentsLogger((record) => records.push(record)) },
      ],
    }).compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { execute.mockClear(); records.splice(0); });

  it('rejects requests without a service JWT', async () => {
    await request(app.getHttpServer() as Server).post('/payments').set('Idempotency-Key', idempotencyKey).send(validBody).expect(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects expired, alg:none, unknown-kid and wrong-audience tokens', async () => {
    const expired = serviceJwt.signToken({ sub: 'booking-service', scope: 'payments:charge', iat: 1, exp: 2 });
    const none = sign({ sub: 'booking-service', scope: 'payments:charge' }, '', {
      algorithm: 'none', keyid: serviceJwt.config.kid,
    });
    const unknownKid = serviceJwt.signToken({ sub: 'booking-service', scope: 'payments:charge' }, { keyid: 'unknown-kid' });
    const wrongAudience = serviceJwt.signToken({ sub: 'booking-service', scope: 'payments:charge', aud: 'other-service' });

    for (const candidate of [expired, none, unknownKid, wrongAudience]) {
      await request(app.getHttpServer() as Server)
        .post('/payments').set('Authorization', `Bearer ${candidate}`).set('Idempotency-Key', idempotencyKey).send(validBody).expect(401);
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it('forbids a user JWT and a service JWT with the wrong scope', async () => {
    const userLike = serviceJwt.signToken({
      sub: 'b73958c2-2ecb-46a2-bc93-b1cba20f9898',
      role: 'GUEST',
      sid: 'c23c61c8-1ccb-4c3f-932b-b62505420aae',
      jti: 'user-access-token',
      scope: 'payments:user',
    });
    const wrongScope = token('payments:refund');

    for (const candidate of [userLike, wrongScope]) {
      await request(app.getHttpServer() as Server)
        .post('/payments').set('Authorization', `Bearer ${candidate}`).set('Idempotency-Key', idempotencyKey).send(validBody).expect(403);
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects extra fields and card-number shaped payment tokens', async () => {
    const authorization = `Bearer ${token()}`;
    await request(app.getHttpServer() as Server).post('/payments')
      .set('Authorization', authorization).set('Idempotency-Key', idempotencyKey)
      .send({ ...validBody, unexpected: true }).expect(400);
    await request(app.getHttpServer() as Server).post('/payments')
      .set('Authorization', authorization).set('Idempotency-Key', idempotencyKey)
      .send({ ...validBody, paymentMethod: { ...validBody.paymentMethod, token: '4111111111111111' } }).expect(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects an oversized body and does not expose payment secrets in logs or errors', async () => {
    const oversized = { ...validBody, padding: 'x'.repeat(9_000) };
    const response = await request(app.getHttpServer() as Server).post('/payments')
      .set('Authorization', `Bearer ${token()}`).set('Idempotency-Key', idempotencyKey)
      .send(oversized).expect(413);
    const serialized = JSON.stringify({ response: response.body, records });
    expect(serialized).not.toContain(MOCK_GATEWAY_TOKENS.approved);
    expect(execute).not.toHaveBeenCalled();
  });
});
