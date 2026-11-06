import { SearchLogger } from '../../src/infrastructure/observability/search-logger';
describe('SearchLogger', () => {
  it('redacts nested secrets, terms, URLs, JWTs and errors while preserving correlation', () => {
    const sink = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const logger = new SearchLogger();
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    logger.info('Bearer secret https://private.local/path eyJhbGci.abc.def', {
      traceId: 'trace-123', eventId: 'event-123', count: 2n,
      nested: { q: 'private search', authorization: 'secret', sourceUrl: 'amqp://user:password@host', error: new Error('secret details') }, cycle,
    });
    const record = sink.mock.calls[0]?.[0] as string;
    expect(record).not.toMatch(/private|password|secret details|eyJhbGci/);
    expect(record).toContain('trace-123'); expect(record).toContain('event-123');
    expect((JSON.parse(record) as { level: string }).level).toBe('info');
  });
  it('respects the configured log level', () => {
    const sink = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const logger = new SearchLogger(); logger.setLevel('warn');
    logger.info('hidden'); logger.debug('hidden'); logger.error('visible');
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]?.[0]).toContain('visible');
  });
});
