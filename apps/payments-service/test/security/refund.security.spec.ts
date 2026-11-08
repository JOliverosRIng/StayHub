import { Test } from '@nestjs/testing';
import type { INestApplication, Type } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { RefundsController } from '../../src/interfaces/http/refunds/refunds.controller';
import { RefundPayment } from '../../src/application/refunds/refund-payment.use-case';
import { ServiceAuthGuard } from '../../src/interfaces/http/guards/service-auth.guard';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { DomainError } from '../../src/domain/shared/domain-error';
import { createTestJwtFixture } from '../fixtures/jwt.fixture';

const serviceJwt = createTestJwtFixture({ issuer: 'stayhub-bookings-service', audience: 'stayhub-payments-service' });
const userJwt = createTestJwtFixture({ issuer: 'stayhub-auth', audience: 'stayhub-api' });
const config = {
  serviceJwt: serviceJwt.config,
  refundScope: 'payments:refund',
} as unknown as PaymentsConfig;
const paymentA = '56ac8df3-4ab6-48d2-8248-37ec830c9131';
const paymentB = '56ac8df3-4ab6-48d2-8248-37ec830c9132';
const idempotencyKey = '768c31dd-86be-4b28-90ea-e8d29efcab7a';
const validBody = { reason: 'GUEST_CANCELLATION' };

interface RefundInput {
  readonly paymentId: string;
  readonly reason: string;
  readonly amountMinor?: number;
  readonly idempotencyKey: string;
  readonly callerSubject: string;
}

describe('POST /payments/:id/refund security', () => {
  let app: INestApplication;
  const reservations = new Map<string, string>();
  const execute = jest.fn((input: RefundInput) => {
    const scope = `refund:${input.paymentId}:${input.idempotencyKey}:${input.callerSubject}`;
    const fingerprint = JSON.stringify({ reason: input.reason, amountMinor: input.amountMinor ?? null });
    const existing = reservations.get(scope);
    if (existing && existing !== fingerprint) return Promise.reject(new DomainError('IDEMPOTENCY_CONFLICT', 'Idempotency key conflicts'));
    if (!existing) reservations.set(scope, fingerprint);
    return Promise.resolve({
      statusCode: 201,
      replayed: Boolean(existing),
      refund: { id: paymentA, paymentId: input.paymentId, status: 'COMPLETED' },
    });
  });
  const serviceToken = (scope: string): string => serviceJwt.signToken({ sub: 'booking-service', scope });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RefundsController as unknown as Type<unknown>],
      providers: [
        { provide: RefundPayment, useValue: { execute } },
        { provide: PAYMENTS_CONFIG, useValue: config },
        ServiceAuthGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { execute.mockClear(); reservations.clear(); });

  const send = (paymentId: string, token: string, body: object = validBody, key = idempotencyKey) =>
    request(app.getHttpServer() as Server).post(`/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);

  it('rejects a user JWT and a service JWT without payments:refund', async () => {
    const user = userJwt.signToken({
      sub: 'b73958c2-2ecb-46a2-bc93-b1cba20f9898',
      role: 'GUEST',
      sid: 'c23c61c8-1ccb-4c3f-932b-b62505420aae',
      jti: 'c33958c2-2ecb-46a2-bc93-b1cba20f9898',
    });
    for (const token of [user, serviceToken('payments:charge')]) await send(paymentA, token).expect(403);
    expect(execute).not.toHaveBeenCalled();
  });

  it('treats the same key on another payment as an independent refund operation', async () => {
    const token = serviceToken('payments:refund');
    await send(paymentA, token).expect(201);
    await send(paymentB, token).expect(201);
    expect(execute.mock.calls).toHaveLength(2);
    expect(execute.mock.calls[0]?.[0].paymentId).toBe(paymentA);
    expect(execute.mock.calls[1]?.[0].paymentId).toBe(paymentB);
  });

  it('rejects a changed body when the key is reused for the same payment', async () => {
    const token = serviceToken('payments:refund');
    await send(paymentA, token).expect(201);
    await send(paymentA, token, { reason: 'GUEST_CANCELLATION', amountMinor: 5_000_000 }).expect(409);
  });

  it('rejects extra fields and unsupported refund reasons', async () => {
    const token = serviceToken('payments:refund');
    await send(paymentA, token, { ...validBody, unexpected: true }).expect(400);
    await send(paymentA, token, { reason: 'OTHER' }).expect(400);
    expect(execute).not.toHaveBeenCalled();
  });
});
