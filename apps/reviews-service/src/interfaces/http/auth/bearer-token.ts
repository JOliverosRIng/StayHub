import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

export function extractSingleBearer(request: Request): string {
  const authorizationHeaders = request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'authorization');
  if (authorizationHeaders.length !== 1) throw new UnauthorizedException('Exactly one Authorization header is required');
  const value = request.headers.authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ') || value.length <= 7 || value.includes(',')) throw new UnauthorizedException('Bearer token required');
  return value.slice(7);
}
