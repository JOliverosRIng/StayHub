import type {
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
} from 'amqplib';
import type { UpsertProjection } from '../../src/application/projections/upsert-projection.use-case';
import type { RemoveProjection } from '../../src/application/projections/remove-projection.use-case';
import type { SearchConfig } from '../../src/infrastructure/config/search-config';
import {
  RabbitMqProjectionConsumer,
  type RabbitMqConnector,
} from '../../src/infrastructure/messaging/rabbitmq-projection.consumer';
import type { SearchLogger } from '../../src/infrastructure/observability/search-logger';
import {
  removedProjectionEventFixture,
  upsertedProjectionEventFixture,
} from '../fixtures/projection-events.fixture';
import { publishProjectionFixture } from '../helpers/projection-publisher';

interface Harness {
  readonly consumer: RabbitMqProjectionConsumer;
  readonly channel: ConfirmChannel;
  readonly assertExchange: jest.Mock;
  readonly assertQueue: jest.Mock;
  readonly bindQueue: jest.Mock;
  readonly prefetch: jest.Mock;
  readonly consume: jest.Mock;
  readonly cancel: jest.Mock;
  readonly sendToQueue: jest.Mock;
  readonly waitForConfirms: jest.Mock;
  readonly ack: jest.Mock;
  readonly nack: jest.Mock;
  readonly upsert: jest.Mock;
  readonly remove: jest.Mock;
  readonly warn: jest.Mock;
}

const config = {
  rabbitmqUrl: 'amqp://fixture',
  rabbitmqExchange: 'stayhub.search.v1',
  rabbitmqQueue: 'stayhub.search.projection.v1',
  rabbitmqDlq: 'stayhub.search.projection.v1.dlq',
  rabbitmqPrefetch: 7,
  rabbitmqMaxRetries: 3,
  rabbitmqRetryBaseMs: 100,
  dependencyTimeoutMs: 500,
} as SearchConfig;

function harness(): Harness {
  const assertExchange = jest.fn().mockResolvedValue({ exchange: '' });
  const assertQueue = jest.fn().mockImplementation((queue: string) =>
    Promise.resolve({ queue, messageCount: 0, consumerCount: 0 }),
  );
  const bindQueue = jest.fn().mockResolvedValue({});
  const prefetch = jest.fn().mockResolvedValue({});
  const consume = jest.fn().mockResolvedValue({ consumerTag: 'consumer' });
  const cancel = jest.fn().mockResolvedValue({});
  const sendToQueue = jest.fn().mockReturnValue(true);
  const waitForConfirms = jest.fn().mockResolvedValue(undefined);
  const ack = jest.fn();
  const nack = jest.fn();
  const channel = {
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    cancel,
    assertExchange,
    assertQueue,
    bindQueue,
    prefetch,
    consume,
    sendToQueue,
    waitForConfirms,
    ack,
    nack,
  } as unknown as ConfirmChannel;
  const connection = {
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    createConfirmChannel: jest.fn().mockResolvedValue(channel),
  } as unknown as ChannelModel;
  const connector: RabbitMqConnector = jest.fn().mockResolvedValue(connection);
  const upsert = jest.fn().mockResolvedValue('APPLIED');
  const remove = jest.fn().mockResolvedValue('REMOVED');
  const warn = jest.fn();
  const logger = {
    info: jest.fn(),
    warn,
    error: jest.fn(),
  } as unknown as SearchLogger;
  const consumer = new RabbitMqProjectionConsumer(
    config,
    { execute: upsert } as unknown as UpsertProjection,
    { execute: remove } as unknown as RemoveProjection,
    logger,
    connector,
  );
  return {
    consumer,
    channel,
    assertExchange,
    assertQueue,
    bindQueue,
    prefetch,
    consume,
    cancel,
    sendToQueue,
    waitForConfirms,
    ack,
    nack,
    upsert,
    remove,
    warn,
  };
}

function message(value: unknown, retry?: number): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(value)),
    fields: {
      deliveryTag: 1,
      redelivered: retry !== undefined,
      exchange: config.rabbitmqExchange,
      routingKey: 'fixture',
      consumerTag: 'consumer',
    },
    properties: {
      contentType: 'application/json',
      contentEncoding: undefined,
      headers: retry === undefined ? undefined : { 'x-search-retry': retry },
      deliveryMode: 2,
      priority: undefined,
      correlationId: undefined,
      replyTo: undefined,
      expiration: undefined,
      messageId: undefined,
      timestamp: undefined,
      type: undefined,
      userId: undefined,
      appId: undefined,
      clusterId: undefined,
    },
  };
}

async function dispatch(
  consumer: RabbitMqProjectionConsumer,
  value: ConsumeMessage,
  channel: ConfirmChannel,
): Promise<void> {
  await (
    consumer as unknown as {
      handle(message: ConsumeMessage, channel: ConfirmChannel): Promise<void>;
    }
  ).handle(value, channel);
}

describe('RabbitMQ projection consumer', () => {
  it('declares durable versioned topology, manual ack and bounded prefetch', async () => {
    const test = harness();
    await test.consumer.start();
    expect(test.assertExchange).toHaveBeenCalledWith(
      'stayhub.search.v1',
      'direct',
      { durable: true },
    );
    expect(test.assertQueue).toHaveBeenCalledWith(
      'stayhub.search.projection.v1',
      expect.objectContaining({ durable: true }),
    );
    expect(test.assertQueue).toHaveBeenCalledWith(
      'stayhub.search.projection.v1.dlq',
      { durable: true },
    );
    expect(test.bindQueue).toHaveBeenCalledWith(
      'stayhub.search.projection.v1',
      'stayhub.search.v1',
      'accommodation.search.v1.upserted',
    );
    expect(test.prefetch).toHaveBeenCalledWith(7);
    expect(test.consume).toHaveBeenCalledWith(
      'stayhub.search.projection.v1',
      expect.any(Function),
      { noAck: false },
    );
  });

  it('acks an upsert only after the transactional use case resolves', async () => {
    const test = harness();
    let commit: ((value: string) => void) | undefined;
    test.upsert.mockReturnValue(
      new Promise((resolve) => {
        commit = resolve;
      }),
    );
    const incoming = message(upsertedProjectionEventFixture);
    const pending = dispatch(test.consumer, incoming, test.channel);
    await Promise.resolve();
    expect(test.ack).not.toHaveBeenCalled();
    commit?.('APPLIED');
    await pending;
    expect(test.ack).toHaveBeenCalledWith(incoming);
  });

  it('routes removal and acknowledges duplicate or stale success outcomes', async () => {
    const test = harness();
    test.upsert.mockResolvedValueOnce('IGNORED_STALE');
    const stale = message(upsertedProjectionEventFixture);
    await dispatch(test.consumer, stale, test.channel);
    const removed = message(removedProjectionEventFixture);
    await dispatch(test.consumer, removed, test.channel);
    expect(test.ack).toHaveBeenCalledWith(stale);
    expect(test.remove).toHaveBeenCalledWith(removedProjectionEventFixture);
    expect(test.ack).toHaveBeenCalledWith(removed);
  });

  it('cancels consumption and drains in-flight work before closing', async () => {
    const test = harness();
    await test.consumer.start();
    await test.consumer.onModuleDestroy();
    expect(test.cancel).toHaveBeenCalledWith('consumer');
  });

  it('dead-letters poison messages without logging their payload', async () => {
    const test = harness();
    const poison = message({ password: 'do-not-log', unknown: true });
    await dispatch(test.consumer, poison, test.channel);
    expect(test.nack).toHaveBeenCalledWith(poison, false, false);
    expect(JSON.stringify(test.warn.mock.calls)).not.toContain('do-not-log');
  });

  it('retries transient failures durably with exponential backoff', async () => {
    const test = harness();
    test.upsert.mockRejectedValueOnce(new Error('database unavailable'));
    const incoming = message(upsertedProjectionEventFixture, 1);
    await dispatch(test.consumer, incoming, test.channel);
    expect(test.sendToQueue).toHaveBeenCalledWith(
      'stayhub.search.projection.v1.retry',
      incoming.content,
      expect.objectContaining({
        persistent: true,
        expiration: '200',
        headers: { 'x-search-retry': 2 },
      }),
    );
    expect(test.waitForConfirms).toHaveBeenCalled();
    expect(test.ack).toHaveBeenCalledWith(incoming);
  });

  it('dead-letters exhausted messages and requeues if retry publication fails', async () => {
    const exhausted = harness();
    exhausted.upsert.mockRejectedValueOnce(new Error('database unavailable'));
    const finalAttempt = message(upsertedProjectionEventFixture, 3);
    await dispatch(exhausted.consumer, finalAttempt, exhausted.channel);
    expect(exhausted.sendToQueue).not.toHaveBeenCalled();
    expect(exhausted.nack).toHaveBeenCalledWith(finalAttempt, false, false);

    const failedPublish = harness();
    failedPublish.upsert.mockRejectedValueOnce(new Error('database unavailable'));
    failedPublish.waitForConfirms.mockRejectedValueOnce(new Error('broker down'));
    const retry = message(upsertedProjectionEventFixture);
    await dispatch(failedPublish.consumer, retry, failedPublish.channel);
    expect(failedPublish.nack).toHaveBeenCalledWith(retry, false, true);
  });

  it('publishes contractual fixtures as persistent JSON', () => {
    const publish = jest.fn().mockReturnValue(true);
    expect(
      publishProjectionFixture(
        { publish },
        upsertedProjectionEventFixture,
      ),
    ).toBe(true);
    expect(publish).toHaveBeenCalledWith(
      'stayhub.search.v1',
      'accommodation.search.v1.upserted',
      expect.any(Buffer),
      { persistent: true, contentType: 'application/json' },
    );
  });
});
