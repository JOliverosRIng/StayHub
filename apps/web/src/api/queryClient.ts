import { MutationCache, QueryCache, QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { ApiError } from './identity';
import { session } from './session';
import { pushToast } from '../components/ui/Toast';

const MAX_RETRIES = 2;

/** Retries only transient failures (network, 502–504). 4xx and 429 are surfaced immediately. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (!(error instanceof ApiError)) return false;
  return error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504;
}

/**
 * Single global handler for authorization failures from any query or mutation (Gateway contract:
 * 401 = not authenticated, 403 = no permission). A 401 invalidates the local session — the route
 * guards (`RequireRole`) then send the user to login — and warns them; a 403 only warns and keeps the
 * session. Toasts deduplicate by key, so a burst of failures shows one message. No per-screen logic.
 */
export function handleApiAuthError(error: unknown): void {
  if (!(error instanceof ApiError)) return;
  if (error.status === 401) {
    session.expire();
    pushToast({ severity: 'error', dedupeKey: 'auth-401', message: 'Tu sesión venció. Inicia sesión nuevamente.' });
  } else if (error.status === 403) {
    pushToast({ severity: 'warning', dedupeKey: 'auth-403', message: 'No tienes permiso para realizar esta acción.' });
  }
}

export function createQueryClient(overrides: DefaultOptions = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleApiAuthError }),
    mutationCache: new MutationCache({ onError: handleApiAuthError }),
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
