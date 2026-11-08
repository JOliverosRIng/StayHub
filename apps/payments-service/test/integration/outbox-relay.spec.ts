import { randomUUID } from 'node:crypto';
import * as amqp from 'amqplib';
import { PrismaClient, type Prisma } from '../../src/infrastructure/persistence/generated/client';
import { PrismaOutboxRepository } from '../../src/infrastructure/persistence/prisma/outbox.repository';
import { RabbitMqPublisher } from '../../src/infrastructure/messaging/rabbitmq.publisher';
import { PublishOutbox } from '../../src/application/events/publish-outbox.use-case';
import type { PendingOutboxEvent } from '../../src/application/ports/outbox.repository';
import type { PaymentsConfig } from '../../src/infrastructure/config/payments-config';

describe('payments outbox relay with PostgreSQL 16 and RabbitMQ', () => {
  let prisma: PrismaClient;
  let repository: PrismaOutboxRepository;
  let connection: amqp.ChannelModel;
  let channel: amqp.Channel;
  const exchange = `stayhub.payments.test.${randomUUID()}`;
  const queue = `payments-outbox-test-${randomUUID()}`;
  const rabbitUrl = process.env.PAYMENTS_TEST_RABBITMQ_URL;

  beforeAll(async () => {
    if (!rabbitUrl) throw new Error('PAYMENTS_TEST_RABBITMQ_URL is required');
    const databaseUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('PAYMENTS_TEST_DATABASE_URL is required');
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    repository = new PrismaOutboxRepository(prisma);
    connection = await amqp.connect(rabbitUrl);
    channel = await connection.createChannel();
    await channel.assertExchange(exchange, 'topic', { durable: true });
    await channel.assertQueue(queue, { durable: false, exclusive: true, autoDelete: true });
    await channel.bindQueue(queue, exchange, 'payment.#');
  });

  afterAll(async () => {
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
    await prisma?.$disconnect();
  });

  function paymentsConfig(url: string): PaymentsConfig {
    return { rabbitmqUrl: url, rabbitmqExchange: exchange } as PaymentsConfig;
  }

  function event(aggregateId: string, id = randomUUID()): PendingOutboxEvent {
    return {
      id,
      aggregateId,
      eventType: 'payment.v1.approved',
      payload: { eventId: id, eventType: 'payment.v1.approved', paymentId: aggregateId },
      attempts: 1,
    };
  }

  async function receiveIds(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let attempt = 0; attempt < 40 && ids.length < count; attempt += 1) {
      const message = await channel.get(queue, { noAck: true });
      const messageProperties = message !== false
        ? message.properties as unknown as { readonly messageId?: unknown }
        : undefined;
      const messageId = messageProperties?.messageId;
      if (typeof messageId === 'string') ids.push(messageId);
      else await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return ids;
  }

  it('publishes durable messages and waits for broker confirms', async () => {
    const publisher = new RabbitMqPublisher(paymentsConfig(rabbitUrl!) as never);
    try {
      const message = event(randomUUID());
      await publisher.publish(message);
      const received = await receiveIds(1);
      expect(received).toEqual([message.id]);
      expect(publisher.isHealthy()).toBe(true);
    } finally {
      await publisher.onApplicationShutdown();
    }
  });

  it('recovers after the broker is unavailable and reconnects with confirms', async () => {
    const mutableConfig = paymentsConfig('amqp://127.0.0.1:1');
    const publisher = new RabbitMqPublisher(mutableConfig as never);
    const message = event(randomUUID());
    try {
      await expect(publisher.publish(message)).rejects.toThrow();
      expect(publisher.isHealthy()).toBe(false);
      (mutableConfig as unknown as { rabbitmqUrl: string }).rabbitmqUrl = rabbitUrl!;
      await publisher.publish(message);
      expect(await receiveIds(1)).toEqual([message.id]);
      expect(publisher.isHealthy()).toBe(true);
    } finally {
      await publisher.onApplicationShutdown();
    }
  });

  it('publishes events in aggregate order and moves exhausted events to DEAD', async () => {
    await channel.purgeQueue(queue);
    const aggregateId = randomUUID();
    const first = event(aggregateId);
    const second = event(aggregateId);
    const other = event(randomUUID());
    const baseTime = new Date(Date.now() - 10_000);
    for (const [index, item] of [first, second, other].entries()) {
      await prisma.outboxEvent.create({ data: {
        id: item.id,
        aggregateId: item.aggregateId,
        eventType: item.eventType,
        payload: item.payload as Prisma.InputJsonObject,
        createdAt: new Date(baseTime.getTime() + index * 1000),
        nextAttemptAt: baseTime,
      } });
    }
    const publisher = new RabbitMqPublisher(paymentsConfig(rabbitUrl!) as never);
    try {
      const relay = new PublishOutbox(repository, publisher, { batchSize: 10, maxAttempts: 3, leaseMs: 30_000, retryBaseMs: 5, retryMaxMs: 50 });
      await relay.execute();
      const firstBatch = await receiveIds(2);
      expect(firstBatch).toHaveLength(2);
      expect(firstBatch).toContain(first.id);
      expect(firstBatch).toContain(other.id);
      expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: 'PUBLISHED' });
      expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: 'PENDING' });
      await relay.execute();
      expect(await receiveIds(10)).toContain(second.id);
      expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: 'PUBLISHED' });

      const dead = event(randomUUID());
      await prisma.outboxEvent.create({ data: {
        id: dead.id, aggregateId: dead.aggregateId, eventType: dead.eventType,
        payload: dead.payload as Prisma.InputJsonObject, createdAt: new Date(0), nextAttemptAt: new Date(0),
      } });
      const failingPublisher = {
        isHealthy: (): boolean => false,
        publish: (): Promise<void> => Promise.reject(new Error('broker down')),
      };
      const failingRelay = new PublishOutbox(repository, failingPublisher, { batchSize: 1, maxAttempts: 2, leaseMs: 30_000, retryBaseMs: 1, retryMaxMs: 2 });
      await failingRelay.execute();
      await prisma.outboxEvent.update({ where: { id: dead.id }, data: { nextAttemptAt: new Date(0) } });
      await failingRelay.execute();
      expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: dead.id } })).toMatchObject({ status: 'DEAD', attempts: 2 });
    } finally {
      await publisher.onApplicationShutdown();
      await prisma.outboxEvent.deleteMany({ where: { id: { in: [first.id, second.id, other.id] } } });
    }
  });

  it('purges only published events older than the configured retention boundary', async () => {
    const oldPublished = event(randomUUID());
    const recentPublished = event(randomUUID());
    const dead = event(randomUUID());
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await prisma.outboxEvent.create({ data: {
      id: oldPublished.id, aggregateId: oldPublished.aggregateId, eventType: oldPublished.eventType,
      payload: oldPublished.payload as Prisma.InputJsonObject, status: 'PUBLISHED',
      createdAt: new Date(cutoff.getTime() - 1_000), publishedAt: new Date(cutoff.getTime() - 1_000),
    } });
    await prisma.outboxEvent.create({ data: {
      id: recentPublished.id, aggregateId: recentPublished.aggregateId, eventType: recentPublished.eventType,
      payload: recentPublished.payload as Prisma.InputJsonObject, status: 'PUBLISHED',
      publishedAt: new Date(cutoff.getTime() + 1_000),
    } });
    await prisma.outboxEvent.create({ data: {
      id: dead.id, aggregateId: dead.aggregateId, eventType: dead.eventType,
      payload: dead.payload as Prisma.InputJsonObject, status: 'DEAD',
    } });

    expect(await repository.purgePublished(cutoff, 10)).toBe(1);
    expect(await prisma.outboxEvent.findUnique({ where: { id: oldPublished.id } })).toBeNull();
    expect(await prisma.outboxEvent.findUnique({ where: { id: recentPublished.id } })).not.toBeNull();
    expect(await prisma.outboxEvent.findUnique({ where: { id: dead.id } })).not.toBeNull();
    await prisma.outboxEvent.deleteMany({ where: { id: { in: [recentPublished.id, dead.id] } } });
  });
});
