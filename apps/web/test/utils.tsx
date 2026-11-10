import type { ReactElement, ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, type Location } from 'react-router-dom';
import { createQueryClient } from '../src/api/queryClient';

export const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

/** Query client without retries or caching between tests. */
export function createTestQueryClient(): QueryClient {
  return createQueryClient({ queries: { retry: false, gcTime: Infinity, staleTime: 0 } });
}

export function QueryWrapper({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** `wrapper` for `renderHook` with a fresh query client. */
export function createQueryWrapper(client = createTestQueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryWrapper client={client}>{children}</QueryWrapper>;
  };
}

/** Captures the current router location so tests can assert navigation. */
export const locationRef: { current?: Location } = {};
function LocationProbe() {
  locationRef.current = useLocation();
  return null;
}

interface Options {
  route?: string | { pathname: string; search?: string; state?: unknown };
  /** Route pattern for `ui`, e.g. `/property/:id`. Other paths render a marker with the pathname. */
  path?: string;
  client?: QueryClient;
}

export function renderWithProviders(ui: ReactElement, { route = '/', path, client = createTestQueryClient() }: Options = {}): RenderResult & { client: QueryClient } {
  locationRef.current = undefined;
  const result = render(
    <QueryWrapper client={client}>
      <MemoryRouter initialEntries={[route]} future={routerFuture}>
        <LocationProbe />
        {path ? (
          <Routes>
            <Route path={path} element={ui} />
            <Route path="*" element={<RouteMarker />} />
          </Routes>
        ) : ui}
      </MemoryRouter>
    </QueryWrapper>,
  );
  return { ...result, client };
}

function RouteMarker() {
  const location = useLocation();
  return <p data-testid="route">{location.pathname}{location.search}</p>;
}
