import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '@accommodations/interfaces/http/auth/jwt.strategy';
import { OptionalJwtGuard } from '@accommodations/interfaces/http/auth/optional-jwt.guard';
import { RolesGuard } from '@accommodations/interfaces/http/guards/roles.guard';
import { ServiceAuthGuard } from '@accommodations/interfaces/http/auth/service-auth.guard';
@Module({ providers: [JwtAuthGuard, OptionalJwtGuard, RolesGuard, ServiceAuthGuard], exports: [JwtAuthGuard, OptionalJwtGuard, RolesGuard, ServiceAuthGuard] })
export class AuthModule {}
