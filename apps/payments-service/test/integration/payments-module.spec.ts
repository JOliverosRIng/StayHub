import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PaymentsModule } from '../../src/modules/payments.module';
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
    const module = await Test.createTestingModule({ imports: [PaymentsModule] })
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
});
