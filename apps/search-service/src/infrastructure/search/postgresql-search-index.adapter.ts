import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/client';
import type { SearchIndexPort } from '@search/application/ports/search-index.port';
import type { SearchQuery } from '@search/domain/search-query';
import { createSearchPage, type SearchPage, type SearchResult } from '@search/domain/search-result';
import { PrismaService } from '../persistence/prisma/prisma.service';

interface SearchRow { accommodationId: string; name: string; location: string; minNightlyPrice: Prisma.Decimal; currency: string; capacity: number; amenities: string[]; primaryPhotoUrl: string | null; relevance: number; total: bigint; }
@Injectable()
export class PostgreSqlSearchIndexAdapter implements SearchIndexPort {
  public constructor(private readonly prisma: PrismaService) {}
  public async health(): Promise<boolean> { return this.prisma.isHealthy(); }
  public async cacheGeneration(): Promise<bigint> { const state = await this.prisma.searchIndexState.findUnique({ where: { id: 1 } }); return state?.cacheGeneration ?? 0n; }
  public async search(query: SearchQuery): Promise<SearchPage> {
    const conditions: Prisma.Sql[] = [Prisma.sql`d."published" = TRUE`];
    if (query.location) conditions.push(Prisma.sql`(d."city" ILIKE ${`%${query.location}%`} OR d."region" ILIKE ${`%${query.location}%`} OR d."countryCode" ILIKE ${query.location})`);
    if (query.currency) conditions.push(Prisma.sql`d."currency" = ${query.currency}`);
    if (query.minPrice !== undefined) conditions.push(Prisma.sql`d."minNightlyPrice" >= ${query.minPrice}`);
    if (query.maxPrice !== undefined) conditions.push(Prisma.sql`d."minNightlyPrice" <= ${query.maxPrice}`);
    if (query.guests !== undefined) conditions.push(Prisma.sql`d."capacity" >= ${query.guests}`);
    if (query.amenities.length > 0) conditions.push(Prisma.sql`d."amenities" @> ${query.amenities}::text[]`);
    if (query.checkIn && query.checkOut) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "availability_windows" w WHERE w."accommodationId" = d."accommodationId" AND w."startDate" <= ${query.checkIn}::date AND w."endDate" >= ${query.checkOut}::date AND w."availableCapacity" >= ${query.guests ?? 1})`);
    const rank = query.q ? Prisma.sql`ts_rank_cd(d."searchVector", websearch_to_tsquery('simple', ${query.q}))` : Prisma.sql`0.0`;
    if (query.q) conditions.push(Prisma.sql`d."searchVector" @@ websearch_to_tsquery('simple', ${query.q})`);
    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT d."accommodationId", d."name", concat_ws(', ', d."city", d."region", d."countryCode") AS "location",
        d."minNightlyPrice", d."currency", d."capacity", d."amenities", d."primaryPhotoUrl", ${rank}::float8 AS relevance, count(*) OVER() AS total
      FROM "search_documents" d WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY relevance DESC, d."accommodationId" ASC LIMIT ${query.pageSize} OFFSET ${offset}`);
    const items: SearchResult[] = rows.map((row) => ({ accommodationId: row.accommodationId, name: row.name, location: row.location, minNightlyPrice: Number(row.minNightlyPrice), currency: row.currency, capacity: row.capacity, amenities: row.amenities, primaryPhotoUrl: row.primaryPhotoUrl, relevance: Number(row.relevance) }));
    return createSearchPage(items, query.page, query.pageSize, Number(rows[0]?.total ?? 0n), Boolean(query.checkIn));
  }
}
