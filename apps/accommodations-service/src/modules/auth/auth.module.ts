import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '@accommodations/interfaces/http/auth/jwt.strategy';
import { OptionalJwtGuard } from '@accommodations/interfaces/http/auth/optional-jwt.guard';
import { RolesGuard } from '@accommodations/interfaces/http/guards/roles.guard';
@Module({ providers: [JwtAuthGuard, OptionalJwtGuard, RolesGuard], exports: [JwtAuthGuard, OptionalJwtGuard, RolesGuard] })
export class AuthModule {}
