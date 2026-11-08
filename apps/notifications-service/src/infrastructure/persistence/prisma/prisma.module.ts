import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaNotificationRepository } from './notification.repository';

@Global()
@Module({ providers: [PrismaService, PrismaNotificationRepository], exports: [PrismaService, PrismaNotificationRepository] })
export class PrismaModule {}
