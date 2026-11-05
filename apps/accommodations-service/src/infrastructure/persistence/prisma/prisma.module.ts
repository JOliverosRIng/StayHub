import { Global, Module } from '@nestjs/common';
import { PROPERTY_REPOSITORY } from '@accommodations/application/ports/property.repository';
import { PrismaService } from './prisma.service';
import { PrismaPropertyRepository } from './property.repository';
@Global()
@Module({
  providers: [PrismaService, { provide: PROPERTY_REPOSITORY, useClass: PrismaPropertyRepository }],
  exports: [PrismaService, PROPERTY_REPOSITORY],
})
export class PrismaModule {}
