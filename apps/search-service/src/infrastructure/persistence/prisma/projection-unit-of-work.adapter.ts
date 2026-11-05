import { Injectable } from "@nestjs/common";
import { Prisma } from "../generated/client";
import type {
  ProjectionCommand,
  ProjectionUnitOfWorkPort,
  UpsertProjectionMutation,
} from "@search/application/ports/projection-unit-of-work.port";
import { ProjectionReplayConflictError } from "@search/application/projections/projection-errors";
import type { ProjectionOutcome } from "@search/domain/projection-event";
import { observeDependency } from "../../observability/otel";
import { PrismaService } from "./prisma.service";
import { recordProjectionOutcome } from "../../observability/search-metrics";

@Injectable()
export class PrismaProjectionUnitOfWorkAdapter
  implements ProjectionUnitOfWorkPort
{
  public constructor(
    private readonly prisma: PrismaService,
    private readonly transactionTimeoutMs = 5000,
  ) {}

  public apply(mutation: ProjectionCommand): Promise<ProjectionOutcome> {
    return observeDependency("postgresql", "projection-apply", () =>
      this.prisma.$transaction(
        async (transaction) => {
          const locks = [
            `event:${mutation.eventId}`,
            `accommodation:${mutation.accommodationId}`,
          ].sort();
          for (const lock of locks) await this.lock(transaction, lock);
          const processed = await transaction.processedProjectionEvent.findUnique({
            where: { eventId: mutation.eventId },
          });
          if (processed) {
            if (processed.payloadHash !== mutation.payloadHash)
              throw new ProjectionReplayConflictError(
                "Projection eventId was reused with different content.",
              );
            recordProjectionOutcome("duplicate");
            return processed.outcome as ProjectionOutcome;
          }

          const cursor = await transaction.projectionCursor.findUnique({
            where: { accommodationId: mutation.accommodationId },
          });
          if (cursor && cursor.projectionVersion >= mutation.projectionVersion) {
            await this.record(transaction, mutation, "IGNORED_STALE");
            recordProjectionOutcome("stale");
            return "IGNORED_STALE";
          }

          const existing = await transaction.searchDocument.findUnique({
            where: { accommodationId: mutation.accommodationId },
            select: { published: true },
          });
          if (mutation.kind === "UPSERT") {
            await this.upsert(transaction, mutation);
            if (existing?.published === true || mutation.document.published)
              await this.incrementGeneration(transaction);
            await this.record(transaction, mutation, "APPLIED");
            recordProjectionOutcome("applied");
            return "APPLIED";
          }

          await transaction.searchDocument.deleteMany({
            where: { accommodationId: mutation.accommodationId },
          });
          await transaction.projectionCursor.upsert({
            where: { accommodationId: mutation.accommodationId },
            create: {
              accommodationId: mutation.accommodationId,
              projectionVersion: mutation.projectionVersion,
              removed: true,
            },
            update: {
              projectionVersion: mutation.projectionVersion,
              removed: true,
            },
          });
          if (existing?.published === true)
            await this.incrementGeneration(transaction);
          await this.record(transaction, mutation, "REMOVED");
          recordProjectionOutcome("removed");
          return "REMOVED";
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: this.transactionTimeoutMs,
          timeout: this.transactionTimeoutMs,
        },
      ),
    );
  }

  private async lock(
    transaction: Prisma.TransactionClient,
    value: string,
  ): Promise<void> {
    await transaction.$queryRaw<{ locked: boolean }[]>(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${value}, 0)) IS NULL AS locked`,
    );
  }

  private async upsert(
    transaction: Prisma.TransactionClient,
    mutation: UpsertProjectionMutation,
  ): Promise<void> {
    const document = mutation.document;
    const values = {
      projectionVersion: document.projectionVersion,
      published: document.published,
      name: document.name,
      description: document.description,
      countryCode: document.countryCode,
      region: document.region,
      city: document.city,
      addressSummary: document.addressSummary,
      minNightlyPrice: new Prisma.Decimal(document.minNightlyPrice),
      currency: document.currency,
      capacity: document.capacity,
      amenities: [...document.amenities],
      keywords: [...document.keywords],
      primaryPhotoUrl: document.primaryPhotoUrl,
      sourceUpdatedAt: document.sourceUpdatedAt,
      indexedAt: document.indexedAt,
    };
    await transaction.searchDocument.upsert({
      where: { accommodationId: mutation.accommodationId },
      create: { accommodationId: mutation.accommodationId, ...values },
      update: values,
    });
    if (document.location) {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "search_documents"
        SET "location" = ST_SetSRID(
          ST_MakePoint(${document.location.longitude}, ${document.location.latitude}),
          4326
        )::geography
        WHERE "accommodationId" = ${mutation.accommodationId}::uuid
      `);
    } else {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "search_documents" SET "location" = NULL
        WHERE "accommodationId" = ${mutation.accommodationId}::uuid
      `);
    }
    await transaction.availabilityWindow.deleteMany({
      where: { accommodationId: mutation.accommodationId },
    });
    if (mutation.availability.length > 0)
      await transaction.availabilityWindow.createMany({
        data: mutation.availability.map((window) => ({
          id: window.id,
          accommodationId: window.accommodationId,
          startDate: new Date(`${window.startDate}T00:00:00.000Z`),
          endDate: new Date(`${window.endDate}T00:00:00.000Z`),
          availableCapacity: window.availableCapacity,
          projectionVersion: window.projectionVersion,
        })),
      });
    await transaction.projectionCursor.upsert({
      where: { accommodationId: mutation.accommodationId },
      create: {
        accommodationId: mutation.accommodationId,
        projectionVersion: mutation.projectionVersion,
        removed: false,
      },
      update: {
        projectionVersion: mutation.projectionVersion,
        removed: false,
      },
    });
  }

  private async record(
    transaction: Prisma.TransactionClient,
    mutation: ProjectionCommand,
    outcome: ProjectionOutcome,
  ): Promise<void> {
    await transaction.processedProjectionEvent.create({
      data: {
        eventId: mutation.eventId,
        eventType: mutation.eventType,
        accommodationId: mutation.accommodationId,
        projectionVersion: mutation.projectionVersion,
        payloadHash: mutation.payloadHash,
        outcome,
      },
    });
  }

  private async incrementGeneration(
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.searchIndexState.update({
      where: { id: 1 },
      data: { cacheGeneration: { increment: 1n } },
    });
  }
}
