import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { ApiError, type Problem } from './identity';
import { session } from './session';

/** What the HTTP client needs from the session. The token is read per request, never stored here. */
export interface BearerSource {
  accessToken(): string | undefined;
  recoverFromUnauthorized(): Promise<string>;
  expire(): void;
}

type TrackedConfig = InternalAxiosRequestConfig & { stayhubBearer?: string; stayhubRetried?: boolean };

const DEFAULT_BASE_URL = '/api/v1';
const TIMEOUT_MS = 15_000;

/** Normalizes `VITE_API_BASE_URL`; the Vite dev proxy forwards the default `/api/v1` to the Gateway. */
export function resolveBaseUrl(raw: string | undefined): string {
  const value = raw?.trim();
  return (value ? value : DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export const API_BASE_URL = resolveBaseUrl(import.meta.env.VITE_API_BASE_URL);

export function parseRetryAfter(raw: string | null | undefined, now = Date.now()): number | undefined {
  if (!raw) return undefined;
  const seconds = /^\d+$/.test(raw) ? Number(raw) : Math.ceil((Date.parse(raw) - now) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** Maps transport failures to the same safe `ApiError` the identity client uses. Raw `detail` is never shown. */
export function toApiError(error: AxiosError): ApiError {
  const response = error.response;
  if (!response) return new ApiError(0);
  const data = response.data;
  const problem = data && typeof data === 'object' ? data as Problem : undefined;
  const header = response.headers?.['retry-after'] as string | undefined;
  return new ApiError(response.status, problem, parseRetryAfter(header));
}

export function createHttpClient(source: BearerSource, baseURL = API_BASE_URL): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: TIMEOUT_MS,
    headers: { Accept: 'application/json, application/problem+json' },
  });

  client.interceptors.request.use((config) => {
    const tracked = config as TrackedConfig;
    if (!tracked.stayhubRetried && !config.headers.has('Authorization')) {
      const token = source.accessToken();
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
        tracked.stayhubBearer = token;
      }
    }
    return config;
  });

  client.interceptors.response.use(undefined, async (error: unknown) => {
    if (axios.isCancel(error)) throw error;
    if (!axios.isAxiosError(error)) throw error instanceof ApiError ? error : new ApiError(0);
    const config = error.config as TrackedConfig | undefined;
    const status = error.response?.status;

    // Only requests that carried the session bearer are retried, and only once.
    if (status === 401 && config?.stayhubBearer && !config.stayhubRetried) {
      let token: string;
      try { token = await source.recoverFromUnauthorized(); }
      catch (failure) { throw failure instanceof ApiError ? failure : new ApiError(401); }
      config.stayhubRetried = true;
      config.stayhubBearer = token;
      config.headers.set('Authorization', `Bearer ${token}`);
      return client.request(config);
    }
    if (status === 401 && config?.stayhubRetried) source.expire();
    throw toApiError(error);
  });

  return client;
}

/** Application-wide Gateway client bound to the tab session. */
export const http = createHttpClient(session);
