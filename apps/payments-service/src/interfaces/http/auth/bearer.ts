import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

export function bearer(request: Request): string {
  const authorization = request.headers.authorization;
  if (
    typeof authorization !== 'string' ||
    !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) ||
    request.rawHeaders.filter((header, index) => index % 2 === 0 && header.toLowerCase() === 'authorization').length > 1
  ) {
    throw new UnauthorizedException();
  }
  return authorization.slice(7);
}
