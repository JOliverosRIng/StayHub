import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from '@users/interfaces/http/auth/jwt.strategy';
import { ServiceAuthGuard } from '@users/interfaces/http/guards/service-auth.guard';
@Module({ imports: [PassportModule], providers: [JwtStrategy, ServiceAuthGuard], exports: [PassportModule, ServiceAuthGuard] })
export class UsersAuthModule {}
