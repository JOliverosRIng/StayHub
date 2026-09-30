import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
  type PipeTransform,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  getSchemaPath,
  type ApiResponseOptions,
} from '@nestjs/swagger';
import type { Request } from 'express';

import {
  REGISTER_ACCOUNT_USE_CASE,
  type RegisterAccountUseCase,
} from '@auth/application/ports/auth-use-cases.port';
import { ServiceAuthGuard } from '@auth/interfaces/http/guards/service-auth.guard';
import { traceIdFromRequest } from '@auth/interfaces/http/trace.interceptor';
import { ProblemResponse } from './dto/problem.response';
import { RegisterRequest } from './dto/register.request';
import { RegisterResponse } from './dto/register.response';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function problem(status: number, description: string): ApiResponseOptions {
  return {
    status,
    description,
    content: {
      'application/problem+json': { schema: { $ref: getSchemaPath(ProblemResponse) } },
    },
  };
}

export class IdempotencyKeyPipe implements PipeTransform<unknown, string> {
  public transform(value: unknown): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: ['Idempotency-Key: must be a UUID'],
      });
    }
    return value;
  }
}

@ApiTags('internal-registration')
@ApiSecurity('serviceAuth')
@ApiExtraModels(ProblemResponse)
@Controller('internal/v1/registrations')
@UseGuards(ServiceAuthGuard)
export class RegistrationController {
  public constructor(
    @Inject(REGISTER_ACCOUNT_USE_CASE) private readonly registerAccount: RegisterAccountUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    operationId: 'orchestrateRegistration',
    summary: 'Registers an account through the Auth and Users saga',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID that identifies the registration request',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiResponse({ status: 201, description: 'Registration completed', type: RegisterResponse })
  @ApiResponse(problem(400, 'Invalid request or idempotency key'))
  @ApiResponse(problem(401, 'Invalid service authentication'))
  @ApiResponse(problem(409, 'Registration conflict'))
  @ApiResponse(problem(503, 'Users dependency unavailable'))
  public async register(
    @Body() body: RegisterRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() httpRequest: Request,
  ): Promise<RegisterResponse> {
    const key = new IdempotencyKeyPipe().transform(idempotencyKey);
    const result = await this.registerAccount.execute({
      idempotencyKey: key,
      input: {
        name: body.name,
        email: body.email,
        password: body.password,
        role: body.role,
      },
      traceId: traceIdFromRequest(httpRequest),
    });
    return { id: result.id, name: result.name, email: result.email, role: result.role };
  }
}
