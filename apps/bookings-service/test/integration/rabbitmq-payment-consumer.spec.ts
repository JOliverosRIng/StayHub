import { randomUUID } from 'node:crypto';
import { connect, type Channel, type ChannelModel } from 'amqplib';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { RabbitMqPaymentConsumer } from '@bookings/infrastructure/messaging/rabbitmq-payment.consumer';
import { DomainError } from '@bookings/domain/shared/domain-error';

const rabbitUrl = process.env.BOOKINGS_TEST_RABBITMQ_URL;
const describeRabbit = rabbitUrl ? describe : describe.skip;

const uuid = (suffix: number): string => `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;
const approvedEvent = (suffix: number) => ({
  eventId: uuid(suffix), eventType: 'payment.v1.approved', schemaVersion: 1, occurredAt: '2030-01-01T00:00:00Z',
  paymentId: uuid(suffix + 1), bookingId: uuid(suffix + 2), payerUserId: uuid(suffix + 3), amountMinor: 1000, currency: 'USD',
});
const invalidEvent = (suffix: number) => ({ ...approvedEvent(suffix), eventType: 'payment.v1.unknown' });

describeRabbit('RabbitMQ payment consumer topology', () => {
  let connection: ChannelModel;
  let channel: Channel;
  let consumer: RabbitMqPaymentConsumer;
  let apply: { execute: jest.Mock };
  let applyRefund: { execute: jest.Mock };
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const exchange = `stayhub.test.payments.${suffix}`;
  const queue = `stayhub.test.bookings.payment-events.${suffix}`;
  const retryQueue = `${queue}.retry`;
  const dlq = `${queue}.dlq`;
  const config = {
    rabbitmqUrl: rabbitUrl!, rabbitmqPaymentsExchange: exchange, rabbitmqQueue: queue,
    rabbitmqRetryQueue: retryQueue, rabbitmqDlq: dlq, rabbitmqPrefetch: 5, rabbitmqMaxRetries: 2,
    rabbitmqRetryDelayMs: 200,
  } as BookingsConfig;

  const waitFor = async (predicate: () => Promise<boolean>, timeoutMs = 8_000): Promise<void> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Condition not met before timeout');
  };

  const publish = async (event: unknown, routingKey: string): Promise<void> => {
    const publisher = await connection.createConfirmChannel();
    try {
      await publisher.assertExchange(exchange, 'topic', { durable: true });
      publisher.publish(exchange, routingKey, Buffer.from(JSON.stringify(event)), { persistent: true, contentType: 'application/json', messageId: (event as { eventId: string }).eventId });
      await publisher.waitForConfirms();
    } finally {
      await publisher.close();
    }
  };

  const count = async (name: string): Promise<number> => (await channel.checkQueue(name)).messageCount;

  beforeAll(async () => {
    connection = await connect(rabbitUrl!);
    channel = await connection.createChannel();
    apply = { execute: jest.fn() };
    applyRefund = { execute: jest.fn() };
    consumer = new RabbitMqPaymentConsumer(config, apply as never, applyRefund as never);
    await consumer.start();
    expect(consumer.isHealthy()).toBe(true);
  });

  afterAll(async () => {
    await consumer?.stop();
    try {
      const cleanup = await connection.createChannel();
      await cleanup.deleteQueue(queue).catch(() => undefined);
      await cleanup.deleteQueue(retryQueue).catch(() => undefined);
      await cleanup.deleteQueue(dlq).catch(() => undefined);
      await cleanup.deleteExchange(exchange).catch(() => undefined);
      await cleanup.close();
    } catch {
      // The broker may already be gone during teardown.
    }
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  });

  beforeEach(async () => {
    apply.execute.mockReset();
    applyRefund.execute.mockReset();
    await channel.purgeQueue(queue);
    await channel.purgeQueue(retryQueue);
    await channel.purgeQueue(dlq);
  });

  it('consumes a valid approved event and acknowledges it after the use case resolves', async () => {
    apply.execute.mockResolvedValue('APPLIED');
    const event = approvedEvent(100);
    await publish(event, 'payment.approved');
    await waitFor(async () => apply.execute.mock.calls.length === 1);
    expect(apply.execute).toHaveBeenCalledWith(expect.objectContaining({ eventId: event.eventId, paymentId: event.paymentId }), expect.any(String));
    await waitFor(async () => (await count(queue)) === 0 && (await count(dlq)) === 0);
  });

  it('retries a transient failure through the retry queue without losing the message', async () => {
    apply.execute.mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce('APPLIED');
    await publish(approvedEvent(200), 'payment.approved');
    await waitFor(async () => apply.execute.mock.calls.length >= 2);
    await waitFor(async () => (await count(queue)) === 0 && (await count(dlq)) === 0);
  });

  it('sends an invalid event directly to the DLQ', async () => {
    await publish(invalidEvent(300), 'payment.approved');
    await waitFor(async () => (await count(dlq)) === 1);
    expect(apply.execute).not.toHaveBeenCalled();
  });

  it('moves a permanently failing message to the DLQ after the retry budget', async () => {
    apply.execute.mockRejectedValue(new DomainError('STATE_CONFLICT'));
    await publish(approvedEvent(400), 'payment.approved');
    await waitFor(async () => (await count(dlq)) === 1);
    expect(apply.execute.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('stops consuming and closes its connection cleanly', async () => {
    await consumer.stop();
    expect(consumer.isHealthy()).toBe(false);
    const afterClose = await connect(rabbitUrl!);
    await afterClose.close();
  });
});
