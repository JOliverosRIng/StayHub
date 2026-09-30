import { Body, Controller, Post, HttpCode, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ResolveLoginIdentity } from '@users/application/login/resolve-login-identity.use-case';
import type { LoginIdentity } from '@users/application/ports/user.repository';
import { ServiceAuthGuard, ServiceScope } from '../guards/service-auth.guard';
import { LoginIdentityDto } from './login-identity.dto';
import { LoginIdentityApi } from '../../openapi/login-identity.openapi';
@Controller('internal/v1/login-identities') @UseGuards(ServiceAuthGuard) @ServiceScope('lookup') @ApiBearerAuth('serviceAuth')
export class LoginIdentityController {
  constructor(private readonly resolve: ResolveLoginIdentity) {}
  @Post('resolve') @HttpCode(200) @LoginIdentityApi()
  lookup(@Body() body: LoginIdentityDto): Promise<LoginIdentity> { return this.resolve.execute(body.email); }
}
