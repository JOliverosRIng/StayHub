import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsEmail, IsString, MaxLength } from 'class-validator';

import {
  AuthSessionClient,
  type InternalTokenPair,
} from '@gateway/infrastructure/http/auth-session.client';
import { applyRetryAfter } from '@gateway/interfaces/http/retry-after';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { LoginRateLimitService } from '@gateway/modules/rate-limit/login-rate-limit.service';
import { RefreshCookieService } from '@gateway/modules/auth/refresh-cookie.service';

import { Public } from './public.decorator';

/**
 * GW-038 — Ruta pública `POST /api/v1/auth/login` (FR-007–FR-012).
 *
 * Aplica el límite de login por origen (GW-035) antes de llamar a Auth (429 con `Retry-After`, o
 * 503 fallo cerrado sin Redis), delega en el cliente de sesión (GW-036) y coloca el refresh en la
 * cookie segura (GW-037). La respuesta pública expone el access token y el `Principal`, pero nunca
 * el refresh token (viaja solo en la cookie). Los mensajes de credenciales inválidas provienen de
 * Auth y no permiten enumerar cuentas. Estados 200/400/401/429/503 como Problem Details.
 *
 * Ruta pública: no exige bearer y así lo declara con `@Public()`, que la exime del guard global de
 * GW-040. Es la única vía para obtener una sesión, por lo que el límite de GW-035 es su protección.
 */

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  public readonly email!: string;

  @IsString()
  @MaxLength(128)
  public readonly password!: string;
}

export interface PublicTokenResponse {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly user: {
    readonly userId: string;
    readonly sessionId: string;
    readonly role: string;
  };
}

/** Proyecta el par interno de Auth al contrato público, omitiendo el refresh token. */
export function toPublicTokenResponse(pair: InternalTokenPair): PublicTokenResponse {
  return {
    accessToken: pair.accessToken,
    tokenType: 'Bearer',
    expiresIn: pair.expiresIn,
    user: {
      userId: pair.principal.userId,
      sessionId: pair.principal.sessionId,
      role: pair.principal.role,
    },
  };
}

@Controller('auth')
@Public()
export class LoginController {
  public constructor(
    private readonly rateLimit: LoginRateLimitService,
    private readonly authClient: AuthSessionClient,
    private readonly refreshCookie: RefreshCookieService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  public async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicTokenResponse> {
    await this.enforceRateLimit(request, response);
    const pair = await this.authClient.login(
      { email: dto.email, password: dto.password },
      { traceId: traceIdFromRequest(request) },
    );
    this.refreshCookie.set(response, pair.refreshToken);
    return toPublicTokenResponse(pair);
  }

  private async enforceRateLimit(request: Request, response: Response): Promise<void> {
    try {
      await this.rateLimit.enforce(request);
    } catch (error) {
      applyRetryAfter(error, response);
      throw error;
    }
  }
}
