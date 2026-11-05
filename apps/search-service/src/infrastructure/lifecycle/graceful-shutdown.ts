import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import type { SearchLogger } from '../observability/search-logger';
import type { ShutdownState } from './shutdown-state';

/** Drain HTTP before Nest destroys DB/cache providers. */
export async function closeSearchApplication(app: INestApplication, state: ShutdownState, graceMs: number, stopTelemetry: () => Promise<void>, logger: SearchLogger): Promise<void> {
  state.begin();
  const server = app.getHttpServer() as Server;
  let timer: NodeJS.Timeout | undefined;
  try {
    await new Promise<void>((resolve) => {
      timer = setTimeout(() => { server.closeAllConnections(); resolve(); }, graceMs);
      server.close(() => resolve());
      server.closeIdleConnections();
    });
  } finally { if (timer) clearTimeout(timer); }
  try { await app.close(); }
  finally {
    try { await stopTelemetry(); }
    catch { logger.warn('telemetry.shutdown.failed'); }
    logger.info('shutdown.completed');
  }
}

export function registerShutdown(app: INestApplication, state: ShutdownState, graceMs: number, stopTelemetry: () => Promise<void>, logger: SearchLogger): void {
  let closing = false;
  const handler = (): void => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => { logger.error('shutdown.deadline.exceeded'); process.exit(1); }, graceMs + 1000);
    void closeSearchApplication(app, state, graceMs, stopTelemetry, logger).catch(() => {
      logger.error('shutdown.failed'); process.exitCode = 1;
    }).finally(() => {
      clearTimeout(deadline);
      process.removeListener('SIGTERM', handler); process.removeListener('SIGINT', handler);
    });
  };
  process.on('SIGTERM', handler); process.on('SIGINT', handler);
}
