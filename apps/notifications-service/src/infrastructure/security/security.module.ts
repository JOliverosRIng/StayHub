import { Global, Module } from '@nestjs/common';
import { JwtVerifier } from './jwt.verifier';
import { AccessJwtGuard } from '../../interfaces/http/guards/access-jwt.guard';
import { SendAuthGuard } from '../../interfaces/http/guards/send-auth.guard';
import { RolesGuard } from '../../interfaces/http/guards/roles.guard';
import { NotificationOwnershipGuard } from '../../interfaces/http/guards/notification-ownership.guard';

@Global()
@Module({ providers: [JwtVerifier, AccessJwtGuard, SendAuthGuard, RolesGuard, NotificationOwnershipGuard], exports: [JwtVerifier, AccessJwtGuard, SendAuthGuard, RolesGuard, NotificationOwnershipGuard] })
export class SecurityModule {}
