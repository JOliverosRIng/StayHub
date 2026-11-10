export interface ClosableApplication {
  close(): Promise<void>;
}

export async function shutdownApplication(app: ClosableApplication, graceMs: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<number>((resolve) => { timer = setTimeout(() => resolve(1), graceMs); });
  try {
    const closed = app.close().then(() => 0).catch(() => 1);
    return await Promise.race([closed, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function registerGracefulShutdown(app: ClosableApplication, graceMs: number): void {
  const shutdown = (): void => { void shutdownApplication(app, graceMs).then((code) => process.exit(code)); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
