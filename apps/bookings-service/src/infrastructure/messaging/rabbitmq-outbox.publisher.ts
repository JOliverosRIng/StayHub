import { Inject, Injectable } from '@nestjs/common';
import { connect } from 'amqplib';
import type { OutboxPort } from '@bookings/application/ports/outbox.port';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';

@Injectable()
export class RabbitMqOutboxPublisher implements OutboxPort {
  public constructor(private readonly prisma: PrismaService, @Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig) {}
  public async publishBatch(limit: number): Promise<number> {
    const events = await this.prisma.outboxEvent.findMany({ where: { publishedAt: null, nextAttemptAt: { lte: new Date() } }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: limit });
    if (!events.length) return 0;
    const connection = await connect(this.config.rabbitmqUrl); const channel = await connection.createConfirmChannel();
    try { await channel.assertExchange(this.config.rabbitmqExchange, 'topic', { durable: true }); for (const event of events) channel.publish(this.config.rabbitmqExchange, event.eventType, Buffer.from(JSON.stringify({ eventId: event.id, eventType: event.eventType, schemaVersion: event.schemaVersion, occurredAt: event.occurredAt.toISOString(), ...event.payload as object })), { persistent: true, contentType: 'application/json', messageId: event.id }); await channel.waitForConfirms(); await this.prisma.outboxEvent.updateMany({ where: { id: { in: events.map((event) => event.id) } }, data: { publishedAt: new Date() } }); return events.length; }
    finally { await channel.close(); await connection.close(); }
  }
}
