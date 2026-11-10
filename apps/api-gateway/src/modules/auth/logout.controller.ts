import { Controller, HttpCode, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from './public.decorator';
import { RefreshCookieService } from './refresh-cookie.service';

/** Browser logout removes refresh capability without revoking issued access tokens. */
@Controller('auth')
@Public()
export class LogoutController {
  public constructor(private readonly cookie: RefreshCookieService) {}

  @Post('logout')
  @HttpCode(204)
  @ApiTags('Authentication')
  @ApiOperation({ operationId: 'logout', summary: 'Clear browser refresh cookie; issued tokens are not revoked', security: [] })
  @ApiResponse({ status: 204, description: 'Refresh cookie removed, including when already absent.',
    headers: { 'Set-Cookie': { description: 'Expired Secure HttpOnly refresh cookie.', schema: { type: 'string' } } } })
  public logout(@Res({ passthrough: true }) response: Response): void {
    this.cookie.clear(response);
  }
}
