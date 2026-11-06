import { EventEmitter } from 'node:events';
import { connect } from 'amqplib';
import { RabbitMqHealth } from '../../src/infrastructure/health/rabbitmq-health';
import type { SearchConfig } from '../../src/infrastructure/config/search-config';
jest.mock('amqplib', () => ({ connect: jest.fn() }));
describe('RabbitMQ health probe', () => {
  const config = { rabbitmqUrl: 'amqp://test:test@localhost/test', dependencyTimeoutMs: 25 } as SearchConfig;
  it('authenticates against AMQP and closes the probe connection', async () => {
    const connection = Object.assign(new EventEmitter(), { close: jest.fn().mockResolvedValue(undefined) });
    jest.mocked(connect).mockResolvedValue(connection as unknown as Awaited<ReturnType<typeof connect>>);
    await expect(new RabbitMqHealth(config).health()).resolves.toBe(true);
    expect(connect).toHaveBeenCalledWith(config.rabbitmqUrl, expect.objectContaining({ timeout: 25 }));
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(() => connection.emit('error', new Error('broker closed'))).not.toThrow();
  });
  it('degrades safely when authentication or connection fails', async () => {
    jest.mocked(connect).mockRejectedValue(new Error('amqp://private:secret@host'));
    await expect(new RabbitMqHealth(config).health()).resolves.toBe(false);
  });
});
