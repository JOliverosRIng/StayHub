import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PaymentsModule, PAYMENT_UNIT_OF_WORK } from '../../src/modules/payments.module';
import { RefundsModule } from '../../src/modules/refunds.module';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import type { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma/unit-of-work';
import { createPaymentFixture } from '../fixtures/payments.fixture';
import { createTestJwtFixture } from '../fixtures/jwt.fixture';
import { MOCK_GATEWAY_TOKENS, TEST_TOKEN_HMAC_SECRET } from '../fixtures/mock-gateway.fixture';

const SAMPLE_COUNT = 40;
const WARMUP_COUNT = 10;
const P95_LIMIT_MS = 500;

describe('Payments HTTP latency profile (PostgreSQL 16 + durable mock gateway)', () => {
  let app: INestApplication;
  let server: Server;
  let unitOfWork: PrismaUnitOfWork;
  const serviceJwt = createTestJwtFixture({ issuer: 'stayhub-bookings-service', audience: 'stayhub-payments-service', kid: 'payments-perf-service' });
  const userJwt = createTestJwtFixture({ issuer: 'stayhub-auth', audience: 'stayhub-api', kid: 'payments-perf-user' });
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
    otelServiceName: 'stayhub-payments-performance-test',
    otlpEndpoint: 'http://127.0.0.1:4318',
  } as PaymentsConfig;

  beforeAll(async () => {
    if (!config.databaseUrl) throw new Error('PAYMENTS_TEST_DATABASE_URL is required; run test:performance:profile');
    const module = await Test.createTestingModule({ imports: [PaymentsModule, RefundsModule] })
      .overrideProvider(PAYMENTS_CONFIG).useValue(config).compile();
    app = module.createNestApplication({ logger: false });
    configureHttp(app);
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as unknown as Server;
    unitOfWork = app.get<PrismaUnitOfWork>(PAYMENT_UNIT_OF_WORK);
  });

  afterAll(async () => { await app?.close(); });

  function p95(samples: readonly number[]): number {
    const sorted = [...samples].sort((left, right) => left - right);
    return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
  }

  async function measure<T>(action: () => Promise<T>): Promise<{ readonly value: T; readonly elapsedMs: number }> {
    const started = performance.now();
    const value = await action();
    return { value, elapsedMs: performance.now() - started };
  }

  it('keeps status GET p95 below 500 ms for the documented local profile', async () => {
    const payment = createPaymentFixture(80_000, 'COP', { id: randomUUID(), bookingId: randomUUID(), payerUserId: randomUUID() });
    await unitOfWork.transaction(async ({ payments }) => {
      await payments.save(payment);
      payment.approve({ source: 'performance-fixture', reference: 'opaque-performance-result' });
      await payments.save(payment, { gatewayReference: 'opaque-performance-result', evidenceReference: 'opaque-performance-result' });
    });
    const userToken = userJwt.signToken({ sub: payment.payerUserId, role: 'GUEST', sid: randomUUID(), jti: randomUUID() });
    const samples: number[] = [];

    for (let iteration = 0; iteration < WARMUP_COUNT + SAMPLE_COUNT; iteration += 1) {
      const result = await measure(() => request(server)
        .get(`/payments/${payment.id}/status`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200));
      expect(result.value.body).toMatchObject({ paymentId: payment.id, status: 'APPROVED' });
      if (iteration >= WARMUP_COUNT) samples.push(result.elapsedMs);
    }

    const p95Ms = p95(samples);
    process.stdout.write(`${JSON.stringify({ profile: 'GET /payments/{id}/status', samples: SAMPLE_COUNT, warmup: WARMUP_COUNT, p95Ms })}\n`);
    expect(p95Ms).toBeLessThan(P95_LIMIT_MS);
  });

  it('keeps create-payment POST p95 below 500 ms using the durable mock gateway', async () => {
    const token = serviceJwt.signToken({ sub: 'bookings-service', scope: 'payments:charge' });
    const samples: number[] = [];
    for (let iteration = 0; iteration < WARMUP_COUNT + SAMPLE_COUNT; iteration += 1) {
      const result = await measure(() => request(server)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          bookingId: randomUUID(),
          payerUserId: randomUUID(),
          amountMinor: 80_000,
          currency: 'COP',
          paymentMethod: { type: 'CARD_TOKEN', token: MOCK_GATEWAY_TOKENS.approved },
        })
        .expect(201));
      expect(result.value.body).toMatchObject({ status: 'APPROVED', amountMinor: 80_000 });
      if (iteration >= WARMUP_COUNT) samples.push(result.elapsedMs);
    }

    const p95Ms = p95(samples);
    process.stdout.write(`${JSON.stringify({ profile: 'POST /payments', samples: SAMPLE_COUNT, warmup: WARMUP_COUNT, p95Ms })}\n`);
    expect(p95Ms).toBeLessThan(P95_LIMIT_MS);
  });
});
