import { Global, Module } from '@nestjs/common';
import { JwtVerifier } from './jwt.verifier';
import { AccessJwtGuard } from '../../interfaces/http/guards/access-jwt.guard';
import { SendAuthGuard } from '../../interfaces/http/guards/send-auth.guard';
import { RolesGuard } from '../../interfaces/http/guards/roles.guard';
import { NotificationOwnershipGuard } from '../../interfaces/http/guards/notification-ownership.guard';
import { ServiceJwtGuard } from '../../interfaces/http/guards/service-jwt.guard';

@Global()
@Module({ providers: [JwtVerifier, AccessJwtGuard, SendAuthGuard, RolesGuard, NotificationOwnershipGuard, ServiceJwtGuard], exports: [JwtVerifier, AccessJwtGuard, SendAuthGuard, RolesGuard, NotificationOwnershipGuard, ServiceJwtGuard] })
export class SecurityModule {}
