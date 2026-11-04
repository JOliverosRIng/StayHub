import { Module } from '@nestjs/common';
import { PROPERTY_REPOSITORY, type PropertyRepository } from '@accommodations/application/ports/property.repository';
import { CreatePropertyUseCase } from '@accommodations/application/properties/create-property.use-case';
import { PropertiesController } from '@accommodations/interfaces/http/properties/properties.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PropertiesController],
  providers: [
    { provide: CreatePropertyUseCase, useFactory: (properties: PropertyRepository): CreatePropertyUseCase => new CreatePropertyUseCase(properties), inject: [PROPERTY_REPOSITORY] },
  ],
})
export class PropertiesModule {}
