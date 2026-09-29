import type { OpenAPIObject } from '@nestjs/swagger';

import {
  LOGIN_USE_CASE,
  REGISTER_ACCOUNT_USE_CASE,
  ROTATE_REFRESH_TOKEN_USE_CASE,
  VALIDATE_SESSION_USE_CASE,
} from '@auth/application/ports/auth-use-cases.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { LoginController } from '@auth/interfaces/http/login.controller';
import { RegistrationController } from '@auth/interfaces/http/registration.controller';
import { SessionsController } from '@auth/interfaces/http/sessions.controller';
import { createAuthOpenApi } from '@auth/interfaces/openapi/openapi.factory';
import { createAuthTestApp } from './auth-app';

const systemClock: Clock = { now: (): Date => new Date() };

const unusedUseCase = {
  execute: (): never => {
    throw new Error('Use case must not be invoked while exporting the OpenAPI document');
  },
};

export interface GeneratedAuthOpenApi {
  readonly document: OpenAPIObject;
  close(): Promise<void>;
}

export async function generateAuthOpenApiDocument(): Promise<GeneratedAuthOpenApi> {
  const opened = await createAuthTestApp({
    providers: [
      ServiceJwtVerifier,
      { provide: CLOCK, useValue: systemClock },
      { provide: REGISTER_ACCOUNT_USE_CASE, useValue: unusedUseCase },
      { provide: LOGIN_USE_CASE, useValue: unusedUseCase },
      { provide: ROTATE_REFRESH_TOKEN_USE_CASE, useValue: unusedUseCase },
      { provide: VALIDATE_SESSION_USE_CASE, useValue: unusedUseCase },
    ],
    controllers: [RegistrationController, LoginController, SessionsController],
  });
  return {
    document: createAuthOpenApi(opened.app),
    close: (): Promise<void> => opened.close(),
  };
}
