import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTelemetry } from '../../src/infrastructure/observability/otel';
describe('USR-013 OTLP adapter', () => {
  it('exports safe structured logs and shuts down without raw payloads', async () => {
    const bodies: Buffer[] = [];
    const server = createServer((req, res) => { const chunks: Buffer[] = []; req.on('data', (chunk: Buffer) => chunks.push(chunk)); req.on('end', () => { bodies.push(Buffer.concat(chunks)); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const stdout = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const telemetry = createTelemetry(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    try { telemetry.logger.event('http_request', { traceId: 'a'.repeat(32), status: 200 }); await telemetry.shutdown(); expect(bodies).toHaveLength(1); expect(bodies[0]!.toString()).toContain('users-service'); expect(stdout).toHaveBeenCalled(); }
    finally { stdout.mockRestore(); await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); }
  });
});
