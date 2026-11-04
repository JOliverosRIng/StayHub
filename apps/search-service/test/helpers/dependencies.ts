export const searchTestDatabaseUrl = process.env.SEARCH_TEST_DATABASE_URL;
export const searchTestRedisUrl = process.env.SEARCH_TEST_REDIS_URL;
export const describeWithPostgres = searchTestDatabaseUrl ? describe : describe.skip;
export const describeWithRedis = searchTestRedisUrl ? describe : describe.skip;
