import { Module } from "@nestjs/common";
import {
  PROJECTION_UNIT_OF_WORK_PORT,
  type ProjectionUnitOfWorkPort,
} from "@search/application/ports/projection-unit-of-work.port";
import { RemoveProjection } from "@search/application/projections/remove-projection.use-case";
import { UpsertProjection } from "@search/application/projections/upsert-projection.use-case";
import {
  RABBITMQ_CONNECTOR,
  RabbitMqProjectionConsumer,
  defaultRabbitMqConnector,
} from "@search/infrastructure/messaging/rabbitmq-projection.consumer";
import { PrismaProjectionUnitOfWorkAdapter } from "@search/infrastructure/persistence/prisma/projection-unit-of-work.adapter";
import { PrismaService } from "@search/infrastructure/persistence/prisma/prisma.service";
import { SEARCH_CONFIG } from "@search/infrastructure/config/config.module";
import type { SearchConfig } from "@search/infrastructure/config/search-config";
import { SearchLogger } from "@search/infrastructure/observability/search-logger";

@Module({
  providers: [
    {
      provide: PROJECTION_UNIT_OF_WORK_PORT,
      useFactory: (
        prisma: PrismaService,
        config: SearchConfig,
      ): ProjectionUnitOfWorkPort =>
        new PrismaProjectionUnitOfWorkAdapter(
          prisma,
          config.dependencyTimeoutMs,
        ),
      inject: [PrismaService, SEARCH_CONFIG],
    },
    {
      provide: UpsertProjection,
      useFactory: (unitOfWork: ProjectionUnitOfWorkPort): UpsertProjection =>
        new UpsertProjection(unitOfWork),
      inject: [PROJECTION_UNIT_OF_WORK_PORT],
    },
    {
      provide: RemoveProjection,
      useFactory: (unitOfWork: ProjectionUnitOfWorkPort): RemoveProjection =>
        new RemoveProjection(unitOfWork),
      inject: [PROJECTION_UNIT_OF_WORK_PORT],
    },
    {
      provide: SearchLogger,
      useFactory: (config: SearchConfig): SearchLogger => {
        const logger = new SearchLogger();
        logger.setLevel(config.logLevel);
        return logger;
      },
      inject: [SEARCH_CONFIG],
    },
    { provide: RABBITMQ_CONNECTOR, useValue: defaultRabbitMqConnector },
    RabbitMqProjectionConsumer,
  ],
})
export class ProjectionsModule {}
