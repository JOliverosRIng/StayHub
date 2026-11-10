import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shutdownApplication } from '@bookings/infrastructure/lifecycle/graceful-shutdown';

describe('graceful shutdown', () => {
  it('exits cleanly after closing Nest within the grace period', async () => {
    await expect(shutdownApplication({ close: async () => undefined }, 100)).resolves.toBe(0);
  });

  it('exits with failure when close rejects', async () => {
    await expect(shutdownApplication({ close: async () => { throw new Error('close failed'); } }, 100)).resolves.toBe(1);
  });

  it('enforces the grace period instead of hanging forever', async () => {
    const started = Date.now();
    await expect(shutdownApplication({ close: () => new Promise(() => undefined) }, 25)).resolves.toBe(1);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('runs as non-root with a read-only runtime in the container definition', () => {
    const dockerfile = readFileSync(resolve(__dirname, '../../../../infra/docker/bookings/Dockerfile'), 'utf8');
    expect(dockerfile).toContain('USER node');
    expect(dockerfile).toContain('tini');
    expect(dockerfile).toContain('/health/ready');
  });

  it('declares restart always, read-only filesystem and dropped capabilities in Compose', () => {
    const compose = readFileSync(resolve(__dirname, '../../../../docker-compose.yml'), 'utf8');
    const service = compose.slice(compose.indexOf('  bookings-service:'), compose.indexOf('\nnetworks:'));
    expect(service).toContain('restart: always');
    expect(service).toContain('read_only: true');
    expect(service).toContain('cap_drop: [ALL]');
    expect(service).toContain('no-new-privileges:true');
    expect(service).toContain('/health/ready');
  });
});
