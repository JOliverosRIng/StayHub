/**
 * Starts MSW in the browser with the same contract handlers used by Vitest. Only loaded from
 * `main.tsx` when `vite dev` runs with VITE_API_MOCKS=true; production bundles never import it.
 * Unmatched requests (identity) bypass the worker and reach the Gateway through the Vite proxy.
 */
export async function startMockWorker(): Promise<void> {
  const [{ setupWorker }, { handlers }] = await Promise.all([
    import('msw/browser'),
    import('../../test/msw/handlers'),
  ]);
  await setupWorker(...handlers).start({ onUnhandledRequest: 'bypass' });
}
