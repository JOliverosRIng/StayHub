import type { EventEmitter } from 'node:events';

import type { INestApplication } from '@nestjs/common';

export interface ShutdownRegistration {
  dispose(): void;
}

export function registerShutdownHooks(
  app: Pick<INestApplication, 'close'>,
  stopTelemetry: () => Promise<void>,
  source: EventEmitter = process,
): ShutdownRegistration {
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    void (async (): Promise<void> => {
      try {
        await app.close();
      } finally {
        await stopTelemetry();
      }
    })().catch(() => {
      process.exitCode = 1;
    });
  };
  source.once('SIGTERM', shutdown);
  source.once('SIGINT', shutdown);
  return {
    dispose: (): void => {
      source.removeListener('SIGTERM', shutdown);
      source.removeListener('SIGINT', shutdown);
    },
  };
}
