import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PaymentsConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { JwtStrategy } from './interfaces/http/auth/jwt.strategy';
import { RolesGuard } from './interfaces/http/guards/roles.guard';
import { ServiceAuthGuard } from './interfaces/http/guards/service-auth.guard';

@Module({
  imports: [PaymentsConfigModule, PrismaModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, RolesGuard, ServiceAuthGuard],
})
export class AppModule {}
