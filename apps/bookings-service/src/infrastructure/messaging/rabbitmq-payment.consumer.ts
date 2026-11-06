import { Inject, Injectable } from '@nestjs/common';
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { parsePaymentEvent } from '@bookings/interfaces/events/booking-payment-event.dto';
import { ApplyPaymentResultUseCase } from '@bookings/application/payments/apply-payment-result.use-case';

@Injectable()
export class RabbitMqPaymentConsumer {
  private connection?: ChannelModel; private channel?: Channel;
  public constructor(@Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig, private readonly apply: ApplyPaymentResultUseCase) {}
  public async start(): Promise<void> { this.connection = await connect(this.config.rabbitmqUrl); this.channel = await this.connection.createChannel(); await this.channel.assertExchange(this.config.rabbitmqExchange, 'topic', { durable: true }); await this.channel.assertQueue(this.config.rabbitmqDlq, { durable: true }); await this.channel.assertQueue(this.config.rabbitmqQueue, { durable: true, deadLetterExchange: '', deadLetterRoutingKey: this.config.rabbitmqDlq }); await this.channel.bindQueue(this.config.rabbitmqQueue, this.config.rabbitmqExchange, 'payment.v1.*'); await this.channel.prefetch(this.config.rabbitmqPrefetch); await this.channel.consume(this.config.rabbitmqQueue, (message) => { if (message) void this.handle(message); }); }
  private async handle(message: ConsumeMessage): Promise<void> { if (!this.channel) return; try { const { event, hash } = parsePaymentEvent(JSON.parse(message.content.toString('utf8'))); await this.apply.execute(event, hash); this.channel.ack(message); } catch { this.channel.nack(message, false, false); } }
  public async stop(): Promise<void> { await this.channel?.close(); await this.connection?.close(); }
}
