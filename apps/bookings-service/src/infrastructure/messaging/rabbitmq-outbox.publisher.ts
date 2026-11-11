import { Inject, Injectable } from '@nestjs/common';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import type { OutboxPort } from '@bookings/application/ports/outbox.port';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';

@Injectable()
export class RabbitMqOutboxPublisher implements OutboxPort {
  public constructor(private readonly prisma: PrismaService, @Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig) {}

  public async publishBatch(limit: number): Promise<number> {
    const events = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null, nextAttemptAt: { lte: new Date() } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    if (!events.length) return 0;

    let connection: ChannelModel | undefined;
    let channel: ConfirmChannel | undefined;
    try {
      connection = await connect(this.config.rabbitmqUrl);
      channel = await connection.createConfirmChannel();
      await channel.assertExchange(this.config.rabbitmqOutboundExchange, 'topic', { durable: true });
      for (const event of events) {
        channel.publish(
          this.config.rabbitmqOutboundExchange,
          event.eventType,
          Buffer.from(JSON.stringify({ eventId: event.id, eventType: event.eventType, schemaVersion: event.schemaVersion, occurredAt: event.occurredAt.toISOString(), ...event.payload as object })),
          { persistent: true, contentType: 'application/json', messageId: event.id },
        );
      }
      await channel.waitForConfirms();
      await this.prisma.outboxEvent.updateMany({
        where: { id: { in: events.map((event) => event.id) } },
        data: { publishedAt: new Date(), attempts: { increment: 1 } },
      });
      return events.length;
    } catch (error) {
      for (const event of events) {
        const backoff = Math.min(60_000, 1000 * 2 ** event.attempts);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + backoff) },
        }).catch(() => undefined);
      }
      throw error;
    } finally {
      await channel?.close().catch(() => undefined);
      await connection?.close().catch(() => undefined);
    }
  }
}
