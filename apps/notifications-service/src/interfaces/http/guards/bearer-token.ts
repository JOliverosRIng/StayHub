import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

export function bearerToken(request: Request): string {
  const header = request.header('authorization');
  if (!header || !/^Bearer [^\s]+$/i.test(header)) throw new UnauthorizedException('Bearer token required');
  return header.slice(7);
}
