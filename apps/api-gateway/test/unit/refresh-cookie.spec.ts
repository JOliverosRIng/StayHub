import type { Response } from 'express';

import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-034 — Pruebas de la cookie de refresh (FR-010, FR-024).
 *
 * Test-first: el servicio `RefreshCookieService` se implementa en GW-037, por lo que este spec
 * DEBE quedar en rojo. El servicio se carga por import dinámico con especificador variable, de
 * modo que TypeScript/ESLint permanecen verdes y el fallo ocurre en tiempo de ejecución con
 * "Cannot find module …/refresh-cookie.service" — es decir, por servicio ausente, no por
 * configuración del harness. Cuando GW-037 exista, estas pruebas lo ejercitarán.
 */

const SERVICE_MODULE = '../../src/modules/auth/refresh-cookie.service';
const COOKIE_NAME = 'stayhub_refresh';
const REFRESH_PATH = '/api/v1/auth/refresh';

interface RefreshCookieService {
  set(response: Response, token: string): void;
  clear(response: Response): void;
}

type RefreshCookieServiceCtor = new (config: GatewayConfig) => RefreshCookieService;

async function loadRefreshCookieService(): Promise<RefreshCookieServiceCtor> {
  const specifier: string = SERVICE_MODULE;
  const module = (await import(specifier)) as { RefreshCookieService?: RefreshCookieServiceCtor };
  if (module.RefreshCookieService === undefined) {
    throw new Error('GW-037 pendiente: RefreshCookieService no exporta la clase esperada');
  }
  return module.RefreshCookieService;
}

interface CookieCall {
  readonly name: string;
  readonly value: string;
  readonly options: Record<string, unknown>;
}

interface ClearCall {
  readonly name: string;
  readonly options: Record<string, unknown>;
}

interface FakeResponse {
  readonly response: Response;
  readonly cookies: CookieCall[];
  readonly cleared: ClearCall[];
  readonly bodyWrites: unknown[];
}

function fakeResponse(): FakeResponse {
  const cookies: CookieCall[] = [];
  const cleared: ClearCall[] = [];
  const bodyWrites: unknown[] = [];
  const response = {
    cookie(name: string, value: string, options?: Record<string, unknown>): Response {
      cookies.push({ name, value, options: options ?? {} });
      return response as unknown as Response;
    },
    clearCookie(name: string, options?: Record<string, unknown>): Response {
      cleared.push({ name, options: options ?? {} });
      return response as unknown as Response;
    },
    setHeader(name: string, value: unknown): Response {
      if (name.toLowerCase() === 'set-cookie') cookies.push({ name: 'raw', value: String(value), options: {} });
      return response as unknown as Response;
    },
    send(payload: unknown): Response {
      bodyWrites.push(payload);
      return response as unknown as Response;
    },
    json(payload: unknown): Response {
      bodyWrites.push(payload);
      return response as unknown as Response;
    },
  };
  return { response: response as unknown as Response, cookies, cleared, bodyWrites };
}

const { config } = createTestGatewayConfig();

function sameSiteOf(options: Record<string, unknown>): string {
  const value = options['sameSite'];
  if (typeof value === 'string') return value.toLowerCase();
  return typeof value === 'boolean' ? String(value) : '';
}

describe('Cookie de refresh (GW-034)', () => {
  it('se emite con Secure, HttpOnly y SameSite=Strict', async () => {
    const Service = await loadRefreshCookieService();
    const service = new Service(config);
    const { response, cookies } = fakeResponse();

    service.set(response, 'refresh-token-value-0000000000000000');

    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
    expect(cookies[0]?.options['httpOnly']).toBe(true);
    expect(cookies[0]?.options['secure']).toBe(true);
    expect(sameSiteOf(cookies[0]?.options ?? {})).toBe('strict');
  });

  it('restringe el path solo a la ruta de refresh (no a todo el sitio)', async () => {
    const Service = await loadRefreshCookieService();
    const service = new Service(config);
    const { response, cookies } = fakeResponse();

    service.set(response, 'refresh-token-value-0000000000000000');

    expect(cookies[0]?.options['path']).toBe(REFRESH_PATH);
    expect(cookies[0]?.options['path']).not.toBe('/');
  });

  it('rota el valor en cada renovación: el nuevo reemplaza al anterior', async () => {
    const Service = await loadRefreshCookieService();
    const service = new Service(config);
    const { response, cookies } = fakeResponse();

    service.set(response, 'first-refresh-token-000000000000000');
    service.set(response, 'second-refresh-token-00000000000000');

    expect(cookies).toHaveLength(2);
    // Misma clave (misma cookie del navegador) con valor nuevo → el anterior deja de enviarse.
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
    expect(cookies[1]?.name).toBe(COOKIE_NAME);
    expect(cookies[1]?.value).toBe('second-refresh-token-00000000000000');
    expect(cookies[1]?.value).not.toBe(cookies[0]?.value);
  });

  it('limpia la cookie con el mismo path restringido al invalidar (logout/rotación)', async () => {
    const Service = await loadRefreshCookieService();
    const service = new Service(config);
    const { response, cleared } = fakeResponse();

    service.clear(response);

    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.name).toBe(COOKIE_NAME);
    expect(cleared[0]?.options['path']).toBe(REFRESH_PATH);
  });

  it('nunca expone el refresh token en el cuerpo de la respuesta', async () => {
    const Service = await loadRefreshCookieService();
    const service = new Service(config);
    const { response, cookies, bodyWrites } = fakeResponse();
    const token = 'secret-refresh-token-00000000000000';

    service.set(response, token);

    // El token viaja solo en la cookie; el servicio no escribe cuerpo alguno.
    expect(cookies.some((cookie) => cookie.value.includes(token))).toBe(true);
    expect(bodyWrites).toHaveLength(0);
  });
});
