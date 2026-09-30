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
  LOGIN_USE_CASE,
  type LoginUseCase,
} from '@auth/application/ports/auth-use-cases.port';
import { ServiceAuthGuard } from '@auth/interfaces/http/guards/service-auth.guard';
import { traceIdFromRequest } from '@auth/interfaces/http/trace.interceptor';
import { InternalTokenPairResponse, LoginRequest } from './dto/login.dto';
import { ProblemResponse, problemResponse } from './dto/problem.response';

@ApiTags('internal-authentication')
@ApiSecurity('serviceAuth')
@ApiExtraModels(ProblemResponse)
@Controller('internal/v1/login')
@UseGuards(ServiceAuthGuard)
export class LoginController {
  public constructor(
    @Inject(LOGIN_USE_CASE) private readonly login: LoginUseCase,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ operationId: 'login', summary: 'Authenticates a user with email and password' })
  @ApiResponse({ status: 200, description: 'Authentication succeeded', type: InternalTokenPairResponse })
  @ApiResponse(problemResponse(400, 'Invalid request body'))
  @ApiResponse(problemResponse(401, 'Invalid credentials'))
  @ApiResponse(
    problemResponse(429, 'Too many authentication attempts', {
      'Retry-After': {
        description: 'Seconds to wait before retrying (integer >= 1)',
        schema: { type: 'integer', minimum: 1 },
      },
    }),
  )
  @ApiResponse(problemResponse(503, 'Authoritative dependency unavailable'))
  public async handle(
    @Body() body: LoginRequest,
    @Req() httpRequest: Request,
  ): Promise<InternalTokenPairResponse> {
    const result = await this.login.execute({
      email: body.email,
      password: body.password,
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
}
