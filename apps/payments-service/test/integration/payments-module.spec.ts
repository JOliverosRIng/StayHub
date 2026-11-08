import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PaymentsModule } from '../../src/modules/payments.module';
import { RefundsModule } from '../../src/modules/refunds.module';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { createTestJwtFixture } from '../fixtures/jwt.fixture';
import { MOCK_GATEWAY_TOKENS, TEST_TOKEN_HMAC_SECRET } from '../fixtures/mock-gateway.fixture';

describe('PaymentsModule registration', () => {
  let app: INestApplication;
  const serviceJwt = createTestJwtFixture({
    issuer: 'stayhub-bookings-service',
    audience: 'stayhub-payments-service',
    kid: 'payments-module-test-v1',
  });
  const userJwt = createTestJwtFixture({
    issuer: 'stayhub-auth',
    audience: 'stayhub-api',
    kid: 'payments-module-user-v1',
  });
  const config = {
    port: 3006,
    databaseUrl: process.env.PAYMENTS_TEST_DATABASE_URL ?? '',
    userJwt: userJwt.config,
    serviceJwt: serviceJwt.config,
    chargeScope: 'payments:charge',
    refundScope: 'payments:refund',
    readScope: 'payments:read',
    allowedCurrencies: ['COP', 'USD'],
    maxAmountMinor: 9_000_000_000_000,
    gatewayTimeoutMs: 1_000,
    gatewayCircuitFailureThreshold: 3,
    gatewayCircuitResetMs: 100,
    idempotencyTtlHours: 48,
    tokenHmacSecret: TEST_TOKEN_HMAC_SECRET,
    rabbitmqUrl: undefined,
    rabbitmqExchange: 'stayhub.payments',
    outboxPollIntervalMs: 1_000,
    outboxBatchSize: 50,
    outboxMaxAttempts: 5,
    outboxRetentionDays: 7,
    reconcilerIntervalMs: 30_000,
    reconcilerBatchSize: 50,
    reconcilerMaxAttempts: 5,
    otelServiceName: 'payments-module-test',
    otlpEndpoint: 'http://127.0.0.1:4318',
  } as PaymentsConfig;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PaymentsModule, RefundsModule] })
      .overrideProvider(PAYMENTS_CONFIG)
      .useValue(config)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureHttp(app);
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('wires the service-authenticated HTTP endpoint through the use case to PostgreSQL and the durable mock gateway', async () => {
    const token = serviceJwt.signToken({ sub: 'booking-service', scope: 'payments:charge' });
    const response = await request(app.getHttpServer() as Server)
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        bookingId: randomUUID(),
        payerUserId: randomUUID(),
        amountMinor: 125_000,
        currency: 'COP',
        paymentMethod: { type: 'CARD_TOKEN', token: MOCK_GATEWAY_TOKENS.approved },
      })
      .expect('Content-Type', /application\/json/)
      .expect(201);

    expect(response.body).toMatchObject({ status: 'APPROVED', amountMinor: 125_000 });
    expect(response.headers['idempotent-replay']).toBeUndefined();
    expect(response.body).not.toHaveProperty('gatewayReference');
    expect(JSON.stringify(response.body)).not.toContain(MOCK_GATEWAY_TOKENS.approved);
  });

  it('returns only the persisted public status to the owning user with no-store caching', async () => {
    const bookingId = randomUUID();
    const payerUserId = randomUUID();
    const serviceToken = serviceJwt.signToken({ sub: 'booking-service', scope: 'payments:charge' });
    const created = await request(app.getHttpServer() as Server)
      .post('/payments')
      .set('Authorization', `Bearer ${serviceToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        bookingId,
        payerUserId,
        amountMinor: 125_000,
        currency: 'COP',
        paymentMethod: { type: 'CARD_TOKEN', token: MOCK_GATEWAY_TOKENS.approved },
      })
      .expect(201);
    const createdPayment = created.body as { readonly id: string };
    const userToken = userJwt.signToken({
      sub: payerUserId,
      role: 'GUEST',
      sid: randomUUID(),
      jti: randomUUID(),
    });

    const status = await request(app.getHttpServer() as Server)
      .get(`/payments/${createdPayment.id}/status`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(status.headers['cache-control']).toBe('no-store');
    expect(status.body).toMatchObject({
      paymentId: createdPayment.id,
      bookingId,
      status: 'APPROVED',
      amountMinor: 125_000,
      currency: 'COP',
      refundedAmountMinor: 0,
      failureCode: null,
    });
    expect(status.body).not.toHaveProperty('payerUserId');
    expect(status.body).not.toHaveProperty('gatewayReference');
    expect(status.body).not.toHaveProperty('paymentMethodFingerprint');
  });

  it('wires the service-authenticated refund endpoint through PostgreSQL and the mock gateway', async () => {
    const bookingId = randomUUID();
    const payerUserId = randomUUID();
    const chargeToken = serviceJwt.signToken({ sub: 'booking-service', scope: 'payments:charge' });
    const payment = await request(app.getHttpServer() as Server)
      .post('/payments')
      .set('Authorization', `Bearer ${chargeToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        bookingId,
        payerUserId,
        amountMinor: 125_000,
        currency: 'COP',
        paymentMethod: { type: 'CARD_TOKEN', token: MOCK_GATEWAY_TOKENS.approved },
      })
      .expect(201);
    const paymentId = (payment.body as { readonly id: string }).id;
    const refundToken = serviceJwt.signToken({ sub: 'booking-service', scope: 'payments:refund' });

    const refund = await request(app.getHttpServer() as Server)
      .post(`/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${refundToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'GUEST_CANCELLATION' })
      .expect(201);

    expect(refund.body).toMatchObject({
      paymentId,
      amountMinor: 125_000,
      currency: 'COP',
      reason: 'GUEST_CANCELLATION',
      status: 'COMPLETED',
      failureCode: null,
    });
    expect(refund.body).not.toHaveProperty('gatewayReference');
    const ownerToken = userJwt.signToken({
      sub: payerUserId,
      role: 'GUEST',
      sid: randomUUID(),
      jti: randomUUID(),
    });
    const status = await request(app.getHttpServer() as Server)
      .get(`/payments/${paymentId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((status.body as { readonly status: string }).status).toBe('REFUNDED');
  });
});
