import type { INestApplication } from '@nestjs/common';
import { closeSearchApplication } from '../../src/infrastructure/lifecycle/graceful-shutdown';
import { ShutdownState } from '../../src/infrastructure/lifecycle/shutdown-state';
import { SearchLogger } from '../../src/infrastructure/observability/search-logger';
describe('Search graceful shutdown', () => {
  it('drains HTTP before destroying providers and flushing telemetry', async () => {
    const order: string[] = []; let drained!: () => void;
    const server = { close: jest.fn((callback: () => void) => { order.push('stop-http'); drained = callback; }), closeIdleConnections: jest.fn(), closeAllConnections: jest.fn() };
    const close = jest.fn(() => { order.push('close-providers'); return Promise.resolve(); });
    const app = { getHttpServer: () => server, close } as unknown as INestApplication;
    const state = new ShutdownState(); const logger = new SearchLogger(); jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const closing = closeSearchApplication(app, state, 100, () => { order.push('flush-telemetry'); return Promise.resolve(); }, logger);
    expect(state.isStopping).toBe(true); expect(close).not.toHaveBeenCalled();
    drained(); await closing;
    expect(order).toEqual(['stop-http', 'close-providers', 'flush-telemetry']); expect(server.closeAllConnections).not.toHaveBeenCalled();
  });
  it('forces hanging HTTP connections closed at the grace deadline', async () => {
    jest.useFakeTimers();
    try {
      const server = { close: jest.fn(), closeIdleConnections: jest.fn(), closeAllConnections: jest.fn() };
      const close = jest.fn().mockResolvedValue(undefined);
      const app = { getHttpServer: () => server, close } as unknown as INestApplication;
      const logger = new SearchLogger(); jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const flush = jest.fn().mockResolvedValue(undefined);
      const closing = closeSearchApplication(app, new ShutdownState(), 50, flush, logger);
      await jest.advanceTimersByTimeAsync(50); await closing;
      expect(server.closeAllConnections).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1); expect(flush).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });
  it('still shuts down cleanly when the telemetry collector is unavailable', async () => {
    const server = { close: (done: () => void): void => done(), closeIdleConnections: jest.fn(), closeAllConnections: jest.fn() };
    const app = { getHttpServer: () => server, close: jest.fn().mockResolvedValue(undefined) } as unknown as INestApplication;
    const logger = new SearchLogger(); jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await expect(closeSearchApplication(app, new ShutdownState(), 50, () => Promise.reject(new Error('collector unavailable')), logger)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('telemetry.shutdown.failed');
  });

});
