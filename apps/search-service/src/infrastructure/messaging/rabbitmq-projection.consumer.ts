import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
} from "amqplib";
import { ProjectionReplayConflictError } from "@search/application/projections/projection-errors";
import { RemoveProjection } from "@search/application/projections/remove-projection.use-case";
import { UpsertProjection } from "@search/application/projections/upsert-projection.use-case";
import {
  ProjectionEventValidationError,
  validateProjectionEvent,
} from "@search/interfaces/events/projection-event.dto";
import {
  REMOVED_PROJECTION_EVENT,
  UPSERTED_PROJECTION_EVENT,
  type ProjectionEvent,
} from "@search/domain/projection-event";
import { SEARCH_CONFIG } from "../config/config.module";
import type { SearchConfig } from "../config/search-config";
import { SearchLogger } from "../observability/search-logger";
import { observeConsumer } from "../observability/otel";
import { recordEventLag, recordProjectionOutcome } from "../observability/search-metrics";

export const RABBITMQ_CONNECTOR = Symbol("RABBITMQ_CONNECTOR");
export type RabbitMqConnector = (
  url: string,
  options: { timeout: number },
) => Promise<ChannelModel>;
export const defaultRabbitMqConnector: RabbitMqConnector = (url, options) =>
  connect(url, options);

@Injectable()
export class RabbitMqProjectionConsumer
  implements OnModuleInit, OnModuleDestroy
{
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private startup?: Promise<void>;
  private consumerTag?: string;
  private readonly inFlight = new Set<Promise<void>>();
  private stopping = false;

  public constructor(
    @Inject(SEARCH_CONFIG) private readonly config: SearchConfig,
    private readonly upsert: UpsertProjection,
    private readonly remove: RemoveProjection,
    private readonly logger: SearchLogger,
    @Inject(RABBITMQ_CONNECTOR) private readonly connector: RabbitMqConnector,
  ) {}

  public onModuleInit(): void {
    this.startup = this.start().catch(() => {
      this.logger.warn("projection.consumer.unavailable");
    });
  }

  public async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.startup?.catch(() => undefined);
    if (this.channel && this.consumerTag)
      await this.channel.cancel(this.consumerTag).catch(() => undefined);
    await Promise.allSettled(this.inFlight);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  public async start(): Promise<void> {
    if (this.channel || this.stopping) return;
    const connection = await this.connector(this.config.rabbitmqUrl, {
      timeout: this.config.dependencyTimeoutMs,
    });
    if (this.stopping) {
      await connection.close();
      return;
    }
    connection.on("error", () => undefined);
    const channel = await connection.createConfirmChannel();
    channel.on("error", () => undefined);
    this.connection = connection;
    this.channel = channel;
    await this.configureTopology(channel);
    const reply = await channel.consume(
      this.config.rabbitmqQueue,
      (message) => {
        if (!message) return;
        const pending = this.handle(message, channel);
        this.inFlight.add(pending);
        void pending.then(
          () => this.inFlight.delete(pending),
          () => this.inFlight.delete(pending),
        );
      },
      { noAck: false },
    );
    this.consumerTag = reply.consumerTag;
    this.logger.info("projection.consumer.ready", {
      queue: this.config.rabbitmqQueue,
    });
  }

  private async configureTopology(channel: ConfirmChannel): Promise<void> {
    const deadLetterExchange = `${this.config.rabbitmqExchange}.dlx`;
    const retryQueue = `${this.config.rabbitmqQueue}.retry`;
    await channel.assertExchange(this.config.rabbitmqExchange, "direct", {
      durable: true,
    });
    await channel.assertExchange(deadLetterExchange, "direct", {
      durable: true,
    });
    await channel.assertQueue(this.config.rabbitmqQueue, {
      durable: true,
      deadLetterExchange,
      deadLetterRoutingKey: this.config.rabbitmqDlq,
    });
    await channel.assertQueue(retryQueue, {
      durable: true,
      deadLetterExchange: this.config.rabbitmqExchange,
      deadLetterRoutingKey: retryQueue,
    });
    await channel.assertQueue(this.config.rabbitmqDlq, { durable: true });
    await channel.bindQueue(
      this.config.rabbitmqQueue,
      this.config.rabbitmqExchange,
      UPSERTED_PROJECTION_EVENT,
    );
    await channel.bindQueue(
      this.config.rabbitmqQueue,
      this.config.rabbitmqExchange,
      REMOVED_PROJECTION_EVENT,
    );
    await channel.bindQueue(
      this.config.rabbitmqQueue,
      this.config.rabbitmqExchange,
      retryQueue,
    );
    await channel.bindQueue(
      this.config.rabbitmqDlq,
      deadLetterExchange,
      this.config.rabbitmqDlq,
    );
    await channel.prefetch(this.config.rabbitmqPrefetch);
  }

  private async handle(
    message: ConsumeMessage,
    channel: ConfirmChannel,
  ): Promise<void> {
    return observeConsumer("projection", () => this.handleMessage(message, channel));
  }

  private async handleMessage(
    message: ConsumeMessage,
    channel: ConfirmChannel,
  ): Promise<void> {
    let event: ProjectionEvent | undefined;
    try {
      if (message.content.byteLength > 1_048_576)
        throw new ProjectionEventValidationError("Projection event is too large");
      const value: unknown = JSON.parse(message.content.toString("utf8"));
      event = validateProjectionEvent(value);
      recordEventLag(event.occurredAt);
      if (event.eventType === UPSERTED_PROJECTION_EVENT)
        await this.upsert.execute(event);
      else await this.remove.execute(event);
      channel.ack(message);
    } catch (error) {
      if (
        error instanceof ProjectionEventValidationError ||
        error instanceof ProjectionReplayConflictError ||
        error instanceof SyntaxError
      ) {
        recordProjectionOutcome(error instanceof ProjectionEventValidationError || error instanceof SyntaxError ? "invalid" : "dlq");
        this.logger.warn("projection.message.rejected", {
          eventId: event?.eventId,
          code:
            error instanceof ProjectionReplayConflictError
              ? error.code
              : "SEARCH_PROJECTION_EVENT_INVALID",
        });
        channel.nack(message, false, false);
        return;
      }
      await this.retryOrDeadLetter(message, channel, event?.eventId);
    }
  }

  private async retryOrDeadLetter(
    message: ConsumeMessage,
    channel: ConfirmChannel,
    eventId: string | undefined,
  ): Promise<void> {
    const headers = (message.properties.headers ?? {}) as Record<
      string,
      unknown
    >;
    const previous = headers["x-search-retry"];
    const attempt = typeof previous === "number" ? previous + 1 : 1;
    if (attempt > this.config.rabbitmqMaxRetries) {
      recordProjectionOutcome("dlq");
      this.logger.error("projection.message.exhausted", {
        eventId,
        attempts: attempt - 1,
      });
      channel.nack(message, false, false);
      return;
    }
    const retryQueue = `${this.config.rabbitmqQueue}.retry`;
    try {
      channel.sendToQueue(retryQueue, message.content, {
        persistent: true,
        contentType: "application/json",
        expiration: String(
          this.config.rabbitmqRetryBaseMs * 2 ** (attempt - 1),
        ),
        headers: { "x-search-retry": attempt },
      });
      await channel.waitForConfirms();
      channel.ack(message);
      this.logger.warn("projection.message.retry", { eventId, attempt });
    } catch {
      channel.nack(message, false, true);
    }
  }
}
