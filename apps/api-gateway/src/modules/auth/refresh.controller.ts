import { Controller, HttpCode, HttpException, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  AuthSessionClient,
  type InternalTokenPair,
} from '@gateway/infrastructure/http/auth-session.client';
import { RefreshApiDocs } from '@gateway/interfaces/openapi/session.openapi';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { REFRESH_COOKIE_NAME, RefreshCookieService } from '@gateway/modules/auth/refresh-cookie.service';

import { toPublicTokenResponse, type PublicTokenResponse } from './login.controller';
import { Public } from './public.decorator';

/**
 * GW-038 — Ruta pública `POST /api/v1/auth/refresh` (FR-010, FR-024).
 *
 * Lee el refresh token EXCLUSIVAMENTE de la cookie (nunca del cuerpo), lo rota vía el cliente de
 * sesión (GW-036) y reemite la cookie segura (GW-037). Si Auth rechaza el token (reutilización o
 * inválido → 401), se limpia la cookie: la reutilización obliga a un nuevo login. La respuesta
 * pública nunca expone el refresh token. Estados 200/401/503 como Problem Details.
 *
 * Ruta pública: no exige bearer —la credencial viaja en la cookie— y así lo declara con `@Public()`,
 * que la exime del guard global de GW-040. La sesión solo puede renovarse, nunca crearse aquí.
 */

const UNAUTHORIZED_STATUS = 401;
const COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${REFRESH_COOKIE_NAME}=([^;]+)`);

@Controller('auth')
@Public()
export class RefreshController {
  public constructor(
    private readonly authClient: AuthSessionClient,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RefreshApiDocs()
  public async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicTokenResponse> {
    const token = requireRefreshCookie(request);
    const traceId = traceIdFromRequest(request);

    let pair: InternalTokenPair;
    try {
      pair = await this.authClient.refresh(token, { traceId });
    } catch (error) {
      if (isUnauthorized(error)) this.refreshCookie.clear(response);
      throw error;
    }

    this.refreshCookie.set(response, pair.refreshToken);
    return toPublicTokenResponse(pair);
  }
}

function requireRefreshCookie(request: Request): string {
  const header = request.headers.cookie;
  const raw = typeof header === 'string' ? header : '';
  const value = COOKIE_PATTERN.exec(raw)?.[1];
  if (value === undefined || value === '') {
    throw new UnauthorizedException({ code: 'REFRESH_COOKIE_MISSING' });
  }
  return decodeURIComponent(value);
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpException && error.getStatus() === UNAUTHORIZED_STATUS;
}
