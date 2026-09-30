import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  AuthRegistrationClient,
  type UserSummary,
} from '@gateway/infrastructure/http/auth-registration.client';
import { RegisterApiDocs } from '@gateway/interfaces/openapi/register.openapi';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { RegistrationRateLimitService } from '@gateway/modules/rate-limit/registration-rate-limit.service';

import { RegisterDto } from './dto/register.dto';

/**
 * GW-029 — Ruta pública `POST /api/v1/auth/register` (RQ-02, FR-001–FR-006), SIN lógica de saga.
 *
 * El Gateway solo expone y protege la entrada: valida forma (DTO cerrado de GW-026 vía el
 * ValidationPipe de GW-011), aplica el límite por origen confiable de GW-027 antes de llamar a
 * Auth (429 con `Retry-After`, o 503 fallo cerrado si Redis no responde) y delega en el cliente
 * de GW-028 reenviando `Idempotency-Key` y `traceId`. Auth coordina el registro; aquí no hay
 * orquestación de saga. Los estados 201/400/409/429/503 se conservan como Problem Details.
 *
 * Ruta pública: no exige bearer. El guard de autorización se incorpora en GW-040 y marcará esta
 * ruta como pública explícitamente; hoy no hay guard global que interceptarla.
 */

const IDEMPOTENCY_HEADER = 'idempotency-key';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOO_MANY_REQUESTS_STATUS = 429;

@Controller('auth')
export class RegisterController {
  public constructor(
    private readonly rateLimit: RegistrationRateLimitService,
    private readonly authClient: AuthRegistrationClient,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RegisterApiDocs()
  public async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserSummary> {
    const idempotencyKey = requireIdempotencyKey(request);
    await this.enforceRateLimit(request, response);
    return this.authClient.register(dto, {
      traceId: traceIdFromRequest(request),
      idempotencyKey,
    });
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

function requireIdempotencyKey(request: Request): string {
  const raw = request.headers[IDEMPOTENCY_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || !UUID_PATTERN.test(value)) {
    throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  }
  return value;
}

function applyRetryAfter(error: unknown, response: Response): void {
  if (!(error instanceof HttpException) || error.getStatus() !== TOO_MANY_REQUESTS_STATUS) {
    return;
  }
  const body = error.getResponse();
  const retryAfter =
    typeof body === 'object' && body !== null
      ? (body as { retryAfter?: number }).retryAfter
      : undefined;
  if (typeof retryAfter === 'number') {
    response.setHeader('Retry-After', String(retryAfter));
  }
}
