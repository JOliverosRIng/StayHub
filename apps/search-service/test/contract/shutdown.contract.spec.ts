import { Test } from '@nestjs/testing';
import { get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';
import { closeSearchApplication } from '../../src/infrastructure/lifecycle/graceful-shutdown';
import { ShutdownState } from '../../src/infrastructure/lifecycle/shutdown-state';
import { SearchLogger } from '../../src/infrastructure/observability/search-logger';

describe('shutdown with an in-flight HTTP request', () => {
  it('lets the response finish before closing dependency providers', async () => {
    let received!: () => void;
    const incoming = new Promise<void>((resolve) => { received = resolve; });
    let response!: Response;
    const destroy = jest.fn();
    const module = await Test.createTestingModule({ providers: [{ provide: 'resource', useValue: { onModuleDestroy: destroy } }] }).compile();
    const app = module.createNestApplication();
    app.getHttpAdapter().get('/slow', (_request: unknown, res: Response) => { response = res; received(); });
    const logger = new SearchLogger(); jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const flush = jest.fn().mockResolvedValue(undefined);
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as Server;
    const { port } = server.address() as AddressInfo;
    const completed = new Promise<string>((resolve, reject) => {
      get(`http://127.0.0.1:${port}/slow`, (res) => {
        let body = ''; res.setEncoding('utf8'); res.on('data', (chunk: string) => { body += chunk; }); res.on('end', () => resolve(body)); res.on('error', reject);
      }).on('error', reject);
    });
    try {
      await incoming;
      const shutdown = new ShutdownState();
      const closing = closeSearchApplication(app, shutdown, 1000, flush, logger);
      expect(shutdown.isStopping).toBe(true); expect(destroy).not.toHaveBeenCalled();
      response.end('completed');
      await expect(completed).resolves.toBe('completed'); await closing;
      expect(destroy).toHaveBeenCalledTimes(1); expect(flush).toHaveBeenCalledTimes(1);
    } finally { await app.close(); }
  });
});
