import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  public constructor(private readonly verifier: ServiceJwtVerifier) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header('authorization');
    const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '');
    if (match?.[1] === undefined) {
      throw new UnauthorizedException('Service authentication is required');
    }
    try {
      const principal = await this.verifier.verify(match[1]);
      Object.assign(request, { servicePrincipal: principal });
      return true;
    } catch {
      throw new UnauthorizedException('Service authentication is invalid');
    }
  }
}

