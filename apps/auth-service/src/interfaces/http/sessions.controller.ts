import { Body, Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import {
  ROTATE_REFRESH_TOKEN_USE_CASE,
  VALIDATE_SESSION_USE_CASE,
  type RotateRefreshTokenUseCase,
  type ValidateSessionUseCase,
} from '@auth/application/ports/auth-use-cases.port';
import { ServiceAuthGuard } from '@auth/interfaces/http/guards/service-auth.guard';
import { traceIdFromRequest } from '@auth/interfaces/http/trace.interceptor';
import { InternalTokenPairResponse } from './dto/login.dto';
import { ProblemResponse, problemResponse } from './dto/problem.response';
import { RefreshSessionRequest } from './dto/refresh.dto';
import { ValidateSessionRequest, ValidateSessionResponse } from './dto/validate-session.dto';

@ApiTags('internal-sessions')
@ApiSecurity('serviceAuth')
@ApiExtraModels(ProblemResponse)
@Controller('internal/v1/sessions')
@UseGuards(ServiceAuthGuard)
export class SessionsController {
  public constructor(
    @Inject(ROTATE_REFRESH_TOKEN_USE_CASE)
    private readonly rotateRefreshToken: RotateRefreshTokenUseCase,
    @Inject(VALIDATE_SESSION_USE_CASE)
    private readonly validateSession: ValidateSessionUseCase,
  ) {}

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ operationId: 'rotateRefreshToken', summary: 'Rotates a refresh token' })
  @ApiResponse({ status: 200, description: 'Rotation succeeded', type: InternalTokenPairResponse })
  @ApiResponse(problemResponse(400, 'Invalid request body'))
  @ApiResponse(problemResponse(401, 'Invalid refresh token'))
  @ApiResponse(problemResponse(503, 'Persistence dependency unavailable'))
  public async refresh(
    @Body() body: RefreshSessionRequest,
    @Req() httpRequest: Request,
  ): Promise<InternalTokenPairResponse> {
    const result = await this.rotateRefreshToken.execute({
      refreshToken: body.refreshToken,
      traceId: traceIdFromRequest(httpRequest),
    });
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      absoluteExpiresAt: result.absoluteExpiresAt.toISOString(),
      principal: {
        userId: result.principal.userId,
        sessionId: result.principal.sessionId,
        role: result.principal.role,
      },
    };
  }

  @Post('validate')
  @HttpCode(200)
  @ApiOperation({ operationId: 'validateSession', summary: 'Introspects an authoritative session' })
  @ApiResponse({ status: 200, description: 'Session is active', type: ValidateSessionResponse })
  @ApiResponse(problemResponse(400, 'Invalid request body'))
  @ApiResponse(problemResponse(401, 'Session is not active'))
  @ApiResponse(problemResponse(503, 'Database dependency unavailable'))
  public async validate(
    @Body() body: ValidateSessionRequest,
    @Req() httpRequest: Request,
  ): Promise<ValidateSessionResponse> {
    const result = await this.validateSession.execute({
      sessionId: body.sessionId,
      userId: body.userId,
      traceId: traceIdFromRequest(httpRequest),
    });
    return { active: result.active, role: result.role };
  }
}
