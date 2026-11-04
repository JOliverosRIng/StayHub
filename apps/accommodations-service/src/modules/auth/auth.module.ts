import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '@accommodations/interfaces/http/auth/jwt.strategy';
import { RolesGuard } from '@accommodations/interfaces/http/guards/roles.guard';
@Module({ providers: [JwtAuthGuard, RolesGuard], exports: [JwtAuthGuard, RolesGuard] })
export class AuthModule {}
