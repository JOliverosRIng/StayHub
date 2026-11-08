import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PaymentsConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { JwtStrategy } from './interfaces/http/auth/jwt.strategy';
import { RolesGuard } from './interfaces/http/guards/roles.guard';
import { ServiceAuthGuard } from './interfaces/http/guards/service-auth.guard';
import { PaymentsLogger } from './infrastructure/logging/payments-logger';
import { HealthModule } from './modules/health/health.module';
import { PaymentsModule } from './modules/payments.module';
import { RefundsModule } from './modules/refunds.module';
import { OutboxModule } from './modules/outbox.module';

@Module({
  imports: [PaymentsConfigModule, PrismaModule, OutboxModule, HealthModule, PaymentsModule, RefundsModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, RolesGuard, ServiceAuthGuard, PaymentsLogger],
})
export class AppModule {}
