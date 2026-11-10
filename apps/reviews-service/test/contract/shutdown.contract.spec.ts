import { shutdownApplication } from '@reviews/infrastructure/lifecycle/graceful-shutdown';

describe('graceful shutdown contract', () => {
  it('returns 0 when the application closes cleanly', async () => {
    await expect(shutdownApplication({ close: async () => undefined }, 100)).resolves.toBe(0);
  });

  it('returns 1 when the application close fails', async () => {
    await expect(
      shutdownApplication(
        {
          close: async () => {
            throw new Error('close failed');
          },
        },
        100,
      ),
    ).resolves.toBe(1);
  });

  it('returns 1 when the grace period expires', async () => {
    const app = { close: (): Promise<void> => new Promise<void>(() => undefined) };

    await expect(shutdownApplication(app, 10)).resolves.toBe(1);
  });
});
