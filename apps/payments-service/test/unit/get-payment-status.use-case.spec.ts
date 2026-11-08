import { DomainError } from '../../src/domain/shared/domain-error';
import type { PaymentRepository } from '../../src/application/ports/payment.repository';
import { GetPaymentStatus } from '../../src/application/payments/get-payment-status.use-case';
import { createPaymentFixture, TEST_PAYMENT_ID, TEST_PAYER_ID } from '../fixtures/payments.fixture';

describe('GetPaymentStatus', () => {
  const payment = createPaymentFixture();
  const payments: jest.Mocked<PaymentRepository> = {
    findById: jest.fn(async (id: string) => id === payment.id ? payment : null),
    findActiveByBookingId: jest.fn(),
    save: jest.fn(),
  };
  const useCase = new GetPaymentStatus(payments);

  beforeEach(() => jest.clearAllMocks());

  it('returns the public payment status to its payer', async () => {
    await expect(useCase.execute(TEST_PAYMENT_ID, { kind: 'user', sub: TEST_PAYER_ID, role: 'GUEST' }))
      .resolves.toEqual(expect.objectContaining({
        paymentId: TEST_PAYMENT_ID,
        bookingId: payment.bookingId,
        payerUserId: TEST_PAYER_ID,
        status: 'PENDING',
        amountMinor: 35_000_000,
        currency: 'COP',
        refundedAmountMinor: 0,
        failureCode: null,
      }));
  });

  it('allows admins and authorized service principals to read any payment', async () => {
    await expect(useCase.execute(TEST_PAYMENT_ID, { kind: 'user', sub: 'admin-id', role: 'ADMIN' })).resolves.toMatchObject({ paymentId: TEST_PAYMENT_ID });
    await expect(useCase.execute(TEST_PAYMENT_ID, { kind: 'service', subject: 'bookings-service' })).resolves.toMatchObject({ paymentId: TEST_PAYMENT_ID });
  });

  it('returns the same not-found error for an absent payment and another user payment', async () => {
    const absent = useCase.execute('56ac8df3-4ab6-48d2-8248-37ec830c9132', { kind: 'user', sub: TEST_PAYER_ID, role: 'GUEST' });
    const foreign = useCase.execute(TEST_PAYMENT_ID, { kind: 'user', sub: 'c73958c2-2ecb-46a2-bc93-b1cba20f9898', role: 'GUEST' });
    const [absentError, foreignError] = await Promise.all([absent.catch((error: unknown) => error), foreign.catch((error: unknown) => error)]);
    expect(absentError).toBeInstanceOf(DomainError);
    expect(foreignError).toBeInstanceOf(DomainError);
    expect(absentError).toMatchObject({ code: 'NOT_FOUND' });
    expect(foreignError).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects malformed payment IDs before querying the repository', async () => {
    await expect(useCase.execute('not-a-uuid', { kind: 'user', sub: TEST_PAYER_ID, role: 'GUEST' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(payments.findById).not.toHaveBeenCalled();
  });
});
