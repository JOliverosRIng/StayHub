import { randomUUID } from 'node:crypto';
import { connect } from 'amqplib';
import type { UpsertProjection } from '../../src/application/projections/upsert-projection.use-case';
import type { RemoveProjection } from '../../src/application/projections/remove-projection.use-case';
import type { SearchConfig } from '../../src/infrastructure/config/search-config';
import {
  RabbitMqProjectionConsumer,
  defaultRabbitMqConnector,
} from '../../src/infrastructure/messaging/rabbitmq-projection.consumer';
import type { SearchLogger } from '../../src/infrastructure/observability/search-logger';
import { upsertedProjectionEventFixture } from '../fixtures/projection-events.fixture';
import {
  describeWithRabbitMq,
  searchTestRabbitMqUrl,
} from '../helpers/dependencies';

async function eventually(
  assertion: () => boolean | Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('RabbitMQ condition was not met before timeout');
}

describeWithRabbitMq('RabbitMQ projection runtime', () => {
  it('acks committed messages, retries transient failures and dead-letters poison', async () => {
    const suffix = randomUUID();
    const config = {
      rabbitmqUrl: searchTestRabbitMqUrl,
      rabbitmqExchange: `stayhub.search.test.${suffix}`,
      rabbitmqQueue: `stayhub.search.projection.test.${suffix}`,
      rabbitmqDlq: `stayhub.search.projection.test.${suffix}.dlq`,
      rabbitmqPrefetch: 2,
      rabbitmqMaxRetries: 2,
      rabbitmqRetryBaseMs: 25,
      dependencyTimeoutMs: 1000,
    } as SearchConfig;
    const execute = jest
      .fn()
      .mockResolvedValueOnce('APPLIED')
      .mockRejectedValueOnce(new Error('temporary database failure'))
      .mockResolvedValueOnce('APPLIED');
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as SearchLogger;
    const consumer = new RabbitMqProjectionConsumer(
      config,
      { execute } as unknown as UpsertProjection,
      { execute: jest.fn() } as unknown as RemoveProjection,
      logger,
      defaultRabbitMqConnector,
    );
    await consumer.start();
    const connection = await connect(searchTestRabbitMqUrl!);
    const channel = await connection.createConfirmChannel();
    const publish = async (value: unknown): Promise<void> => {
      channel.publish(
        config.rabbitmqExchange,
        'accommodation.search.v1.upserted',
        Buffer.from(JSON.stringify(value)),
        { persistent: true, contentType: 'application/json' },
      );
      await channel.waitForConfirms();
    };

    try {
      await publish(upsertedProjectionEventFixture);
      await eventually(() => execute.mock.calls.length >= 1);
      await eventually(async () =>
        (await channel.checkQueue(config.rabbitmqQueue)).messageCount === 0,
      );

      await publish({
        ...upsertedProjectionEventFixture,
        eventId: randomUUID(),
      });
      await eventually(() => execute.mock.calls.length >= 3);

      await publish({ password: 'poison-must-not-be-logged' });
      await eventually(async () =>
        (await channel.checkQueue(config.rabbitmqDlq)).messageCount === 1,
      );
      expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain(
        'poison-must-not-be-logged',
      );
    } finally {
      await channel.close();
      await connection.close();
      await consumer.onModuleDestroy();
    }
  });
});
