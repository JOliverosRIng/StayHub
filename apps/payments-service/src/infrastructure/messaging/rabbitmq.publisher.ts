import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import type { EventPublisherPort } from '../../application/ports/event-publisher.port';
import type { PendingOutboxEvent } from '../../application/ports/outbox.repository';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../config/payments-config';

@Injectable()
export class RabbitMqPublisher implements EventPublisherPort, OnModuleInit, OnApplicationShutdown {
  private connection: ChannelModel | undefined;
  private channel: ConfirmChannel | undefined;
  private connecting: Promise<void> | undefined;

  constructor(@Inject(PAYMENTS_CONFIG) private readonly config: PaymentsConfig) {}

  async onModuleInit(): Promise<void> {
    if (this.config.rabbitmqUrl) await this.connect().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    this.channel = undefined;
    const connection = this.connection;
    this.connection = undefined;
    if (connection) await connection.close().catch(() => undefined);
  }

  isHealthy(): boolean {
    return this.channel !== undefined && this.connection !== undefined;
  }

  async publish(event: PendingOutboxEvent): Promise<void> {
    if (!this.config.rabbitmqUrl) throw new Error('RabbitMQ is not configured');
    await this.ensureConnected();
    const channel = this.channel;
    if (!channel) throw new Error('RabbitMQ confirm channel is unavailable');
    const routingKey = event.eventType.replace(/^payment\.v1\./, 'payment.');
    const accepted = channel.publish(
      this.config.rabbitmqExchange,
      routingKey,
      Buffer.from(JSON.stringify(event.payload)),
      { persistent: true, contentType: 'application/json', messageId: event.id, type: event.eventType },
    );
    if (!accepted) await new Promise<void>((resolve) => channel.once('drain', resolve));
    await channel.waitForConfirms();
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isHealthy()) await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    const connectionAttempt: Promise<void> = (async (): Promise<void> => {
      const connection = await amqp.connect(this.config.rabbitmqUrl!);
      connection.on('error', () => { this.channel = undefined; this.connection = undefined; });
      connection.on('close', () => { this.channel = undefined; this.connection = undefined; });
      const channel = await connection.createConfirmChannel();
      await channel.assertExchange(this.config.rabbitmqExchange, 'topic', { durable: true, autoDelete: false });
      this.connection = connection;
      this.channel = channel;
    })().finally(() => { this.connecting = undefined; });
    this.connecting = connectionAttempt;
    return this.connecting;
  }
}
