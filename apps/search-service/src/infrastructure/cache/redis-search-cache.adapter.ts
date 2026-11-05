import { observeDependency, recordCacheOperation } from "../observability/otel";
import { createHash, randomInt } from "node:crypto";
import Redis from "ioredis";
import type { SearchCachePort } from "@search/application/ports/search-cache.port";
import type { SearchPage } from "@search/domain/search-result";
import type {
  SuggestionItem,
  SuggestionQuery,
  SuggestionResponse,
} from "@search/domain/suggestion";
import type { SearchConfig } from "../config/search-config";

export class RedisSearchCacheAdapter implements SearchCachePort {
  private readonly redis: Redis;
  public constructor(
    private readonly config: SearchConfig,
    redis?: Redis,
  ) {
    this.redis =
      redis ??
      new Redis(config.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: config.dependencyTimeoutMs,
        commandTimeout: config.dependencyTimeoutMs,
        enableOfflineQueue: false,
        retryStrategy: (): null => null,
      });
    this.redis.on('error', () => { /* Failure is recorded without connection details. */ });
  }
  public onModuleDestroy(): void { this.redis.disconnect(); }
  public key(generation: bigint, normalized: unknown): string {
    return `search:v1:${generation}:${createHash("sha256").update(JSON.stringify(normalized)).digest("hex")}`;
  }
  public suggestionKey(generation: bigint, query: SuggestionQuery): string {
    return `suggest:v1:${generation}:${createHash("sha256").update(JSON.stringify(query)).digest("hex")}`;
  }
  public async get(key: string): Promise<SearchPage | null> {
    try {
      if (["wait", "end"].includes(this.redis.status)) await this.redis.connect();
      const raw = await observeDependency("redis", "get", () => this.redis.get(key));
      recordCacheOperation(raw ? "hit" : "miss");
      return raw ? (JSON.parse(raw) as SearchPage) : null;
    } catch {
      recordCacheOperation("error");
      return null;
    }
  }
  public async set(key: string, value: SearchPage): Promise<void> {
    try {
      if (["wait", "end"].includes(this.redis.status)) await this.redis.connect();
      const ttl =
        this.config.cacheTtlSeconds +
        randomInt(0, this.config.cacheJitterSeconds + 1);
      await observeDependency("redis", "set", () => this.redis.set(key, JSON.stringify(value), "EX", ttl));
    } catch {
      /* Cache is best effort. */
    }
  }
  public async getSuggestions(key: string): Promise<SuggestionResponse | null> {
    try {
      if (["wait", "end"].includes(this.redis.status))
        await this.redis.connect();
      const raw = await observeDependency("redis", "get", () =>
        this.redis.get(key),
      );
      recordCacheOperation(raw ? "hit" : "miss");
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("items" in parsed)
      )
        return null;
      const rawItems: unknown = (parsed as Record<string, unknown>)["items"];
      if (!Array.isArray(rawItems)) return null;
      const items: SuggestionItem[] = [];
      for (const value of rawItems as unknown[]) {
        if (
          !value ||
          typeof value !== "object" ||
          !("text" in value) ||
          !("type" in value)
        )
          return null;
        const item = value as Record<string, unknown>;
        const text = item["text"];
        const type = item["type"];
        if (
          typeof text !== "string" ||
          (type !== "PROPERTY" && type !== "LOCATION")
        )
          return null;
        items.push({ text, type });
      }
      return { items };
    } catch {
      recordCacheOperation("error");
      return null;
    }
  }
  public async setSuggestions(
    key: string,
    value: SuggestionResponse,
  ): Promise<void> {
    try {
      if (["wait", "end"].includes(this.redis.status))
        await this.redis.connect();
      const ttl =
        this.config.cacheTtlSeconds +
        randomInt(0, this.config.cacheJitterSeconds + 1);
      await observeDependency("redis", "set", () =>
        this.redis.set(key, JSON.stringify(value), "EX", ttl),
      );
    } catch {
      /* Cache is best effort. */
    }
  }
  public async health(): Promise<boolean> {
    try {
      if (["wait", "end"].includes(this.redis.status)) await this.redis.connect();
      return (await observeDependency("redis", "ping", () => this.redis.ping())) === "PONG";
    } catch {
      return false;
    }
  }
}
