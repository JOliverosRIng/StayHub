import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { connect, type Channel, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { isRefundResultEvent } from '@bookings/application/ports/payment-saga.port';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { parsePaymentEvent } from '@bookings/interfaces/events/booking-payment-event.dto';
import { ApplyPaymentResultUseCase } from '@bookings/application/payments/apply-payment-result.use-case';
import { ApplyRefundResultUseCase } from '@bookings/application/payments/apply-refund-result.use-case';
import { DomainError } from '@bookings/domain/shared/domain-error';

const RETRY_HEADER = 'x-bookings-retry-count';
const RETRY_ROUTING_KEY = 'payment.retry';
const RECONNECT_DELAY_MS = 5_000;
const PERMANENT_CODES = new Set<string>(['INVALID_EVENT', 'EVENT_ID_CONFLICT', 'PAYMENT_BOOKING_MISMATCH']);

@Injectable()
export class RabbitMqPaymentConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private connection: ChannelModel | undefined;
  private channel: Channel | undefined;
  private publisher: ConfirmChannel | undefined;
  private consumerTag: string | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private connecting: Promise<void> | undefined;
  private stopping = false;

  public constructor(
    @Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig,
    private readonly apply: ApplyPaymentResultUseCase,
    private readonly applyRefund: ApplyRefundResultUseCase,
  ) {}

  public onApplicationBootstrap(): void {
    void this.ensureConnected();
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  public isHealthy(): boolean {
    return Boolean(this.connection && this.channel && this.publisher);
  }

  public async start(): Promise<void> {
    await this.ensureConnected();
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const channel = this.channel;
    const publisher = this.publisher;
    const connection = this.connection;
    const consumerTag = this.consumerTag;
    this.channel = undefined;
    this.publisher = undefined;
    this.connection = undefined;
    this.consumerTag = undefined;
    try {
      if (channel && consumerTag) await channel.cancel(consumerTag).catch(() => undefined);
    } finally {
      await publisher?.close().catch(() => undefined);
      await channel?.close().catch(() => undefined);
      await connection?.close().catch(() => undefined);
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.stopping || this.isHealthy()) return;
    if (this.connecting) return this.connecting;
    const attempt = this.connect()
      .catch(() => { this.scheduleReconnect(); })
      .finally(() => { this.connecting = undefined; });
    this.connecting = attempt;
    return attempt;
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.ensureConnected();
    }, RECONNECT_DELAY_MS);
    this.reconnectTimer.unref();
  }

  private async connect(): Promise<void> {
    const connection = await connect(this.config.rabbitmqUrl);
    try {
      connection.on('error', () => this.reset());
      connection.on('close', () => this.reset());
      const channel = await connection.createChannel();
      const publisher = await connection.createConfirmChannel();
      await this.assertTopology(channel);
      await channel.prefetch(this.config.rabbitmqPrefetch);
      this.connection = connection;
      this.channel = channel;
      this.publisher = publisher;
      const consumer = await channel.consume(this.config.rabbitmqQueue, (message) => {
        if (message) void this.handle(message);
      }, { noAck: false });
      this.consumerTag = consumer.consumerTag;
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private async assertTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(this.config.rabbitmqPaymentsExchange, 'topic', { durable: true, autoDelete: false });
    await channel.assertQueue(this.config.rabbitmqDlq, { durable: true, autoDelete: false });
    await channel.assertQueue(this.config.rabbitmqRetryQueue, {
      durable: true,
      autoDelete: false,
      messageTtl: this.config.rabbitmqRetryDelayMs,
      deadLetterExchange: this.config.rabbitmqPaymentsExchange,
      deadLetterRoutingKey: RETRY_ROUTING_KEY,
    });
    await channel.assertQueue(this.config.rabbitmqQueue, {
      durable: true,
      autoDelete: false,
      deadLetterExchange: '',
      deadLetterRoutingKey: this.config.rabbitmqDlq,
    });
    await channel.bindQueue(this.config.rabbitmqQueue, this.config.rabbitmqPaymentsExchange, 'payment.*');
    await channel.bindQueue(this.config.rabbitmqQueue, this.config.rabbitmqPaymentsExchange, RETRY_ROUTING_KEY);
  }

  private reset(): void {
    this.channel = undefined;
    this.publisher = undefined;
    this.connection = undefined;
    this.consumerTag = undefined;
    this.scheduleReconnect();
  }

  private async handle(message: ConsumeMessage): Promise<void> {
    const channel = this.channel;
    if (!channel) return;

    let parsed;
    try {
      parsed = parsePaymentEvent(JSON.parse(message.content.toString('utf8')));
    } catch (error) {
      await this.routeFailure(message, error, true);
      return;
    }

    try {
      if (isRefundResultEvent(parsed.event)) await this.applyRefund.execute(parsed.event, parsed.hash);
      else await this.apply.execute(parsed.event, parsed.hash);
      channel.ack(message);
    } catch (error) {
      await this.routeFailure(message, error, false);
    }
  }

  private property(message: ConsumeMessage, name: 'messageId' | 'type' | 'contentType'): string | undefined {
    const properties: unknown = message.properties;
    if (!properties || typeof properties !== 'object') return undefined;
    const value = (properties as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
  }

  private header(message: ConsumeMessage, name: string): unknown {
    const properties: unknown = message.properties;
    if (!properties || typeof properties !== 'object') return undefined;
    const headers = (properties as Record<string, unknown>).headers;
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return undefined;
    return (headers as Record<string, unknown>)[name];
  }

  private async routeFailure(message: ConsumeMessage, error: unknown, permanent: boolean): Promise<void> {
    const code = error instanceof DomainError ? error.code : 'PROCESSING_FAILED';
    const attempts = this.attempts(message);
    if (permanent || PERMANENT_CODES.has(code) || attempts >= this.config.rabbitmqMaxRetries) {
      await this.publishToDlq(message, code, attempts);
      return;
    }
    await this.publishToRetry(message, attempts + 1);
  }

  private attempts(message: ConsumeMessage): number {
    const raw = this.header(message, RETRY_HEADER);
    const value = typeof raw === 'number' ? raw : Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  private async publishToRetry(message: ConsumeMessage, attempt: number): Promise<void> {
    const channel = this.channel;
    const publisher = this.publisher;
    if (!channel || !publisher) {
      channel?.nack(message, false, true);
      return;
    }
    const messageId = this.property(message, 'messageId');
    const type = this.property(message, 'type');
    const contentType = this.property(message, 'contentType') ?? 'application/json';
    try {
      publisher.publish('', this.config.rabbitmqRetryQueue, message.content, {
        persistent: true,
        contentType,
        ...(messageId ? { messageId } : {}),
        ...(type ? { type } : {}),
        headers: {
          [RETRY_HEADER]: attempt,
          ...(messageId ? { 'x-event-id': messageId } : {}),
        },
      });
      await publisher.waitForConfirms();
      channel.ack(message);
    } catch {
      channel.nack(message, false, true);
    }
  }

  private async publishToDlq(message: ConsumeMessage, code: string, attempts: number): Promise<void> {
    const channel = this.channel;
    const publisher = this.publisher;
    if (!channel || !publisher) {
      channel?.nack(message, false, true);
      return;
    }
    const messageId = this.property(message, 'messageId');
    const type = this.property(message, 'type');
    const contentType = this.property(message, 'contentType') ?? 'application/json';
    try {
      publisher.publish('', this.config.rabbitmqDlq, message.content, {
        persistent: true,
        contentType,
        ...(messageId ? { messageId } : {}),
        ...(type ? { type } : {}),
        headers: {
          'x-bookings-error-code': code.slice(0, 80),
          'x-bookings-attempts': attempts,
          ...(messageId ? { 'x-event-id': messageId } : {}),
        },
      });
      await publisher.waitForConfirms();
      channel.ack(message);
    } catch {
      channel.nack(message, false, true);
    }
  }
}
