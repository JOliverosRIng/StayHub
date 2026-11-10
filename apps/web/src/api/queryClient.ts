import { QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { ApiError } from './identity';

const MAX_RETRIES = 2;

/** Retries only transient failures (network, 502–504). 4xx and 429 are surfaced immediately. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(error instanceof ApiError)) return false;
  return error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504;
}

export function createQueryClient(overrides: DefaultOptions = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      ...overrides,
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        ...overrides.queries,
      },
      mutations: { retry: false, ...overrides.mutations },
    },
  });
}

export const queryClient = createQueryClient();
