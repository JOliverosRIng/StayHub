import { Module } from '@nestjs/common';
import { PROPERTY_REPOSITORY, type PropertyRepository } from '@accommodations/application/ports/property.repository';
import { STORAGE_PORT, type StoragePort } from '@accommodations/application/ports/storage.port';
import { AddPropertyPhotoUseCase } from '@accommodations/application/photos/add-property-photo.use-case';
import { CreatePropertyUseCase } from '@accommodations/application/properties/create-property.use-case';
import { GetPropertyUseCase } from '@accommodations/application/properties/get-property.use-case';
import { GetBookingQuoteUseCase } from '@accommodations/application/properties/get-booking-quote.use-case';
import { ReplacePropertyUseCase } from '@accommodations/application/properties/replace-property.use-case';
import { ACCOMMODATIONS_CONFIG, type AccommodationsConfig } from '@accommodations/infrastructure/config/accommodations-config';
import { LocalStorageAdapter } from '@accommodations/infrastructure/files/local-storage.adapter';
import { PropertiesController } from '@accommodations/interfaces/http/properties/properties.controller';
import { BookingQuoteController } from '@accommodations/interfaces/http/internal/booking-quote.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PropertiesController, BookingQuoteController],
  providers: [
    { provide: STORAGE_PORT, useFactory: (config: AccommodationsConfig): StoragePort => new LocalStorageAdapter(config.photoStorageRoot), inject: [ACCOMMODATIONS_CONFIG] },
    { provide: CreatePropertyUseCase, useFactory: (properties: PropertyRepository): CreatePropertyUseCase => new CreatePropertyUseCase(properties), inject: [PROPERTY_REPOSITORY] },
    { provide: GetPropertyUseCase, useFactory: (properties: PropertyRepository): GetPropertyUseCase => new GetPropertyUseCase(properties), inject: [PROPERTY_REPOSITORY] },
    { provide: GetBookingQuoteUseCase, useFactory: (properties: PropertyRepository): GetBookingQuoteUseCase => new GetBookingQuoteUseCase(properties), inject: [PROPERTY_REPOSITORY] },
    { provide: ReplacePropertyUseCase, useFactory: (properties: PropertyRepository): ReplacePropertyUseCase => new ReplacePropertyUseCase(properties), inject: [PROPERTY_REPOSITORY] },
    {
      provide: AddPropertyPhotoUseCase,
      useFactory: (properties: PropertyRepository, storage: StoragePort): AddPropertyPhotoUseCase => new AddPropertyPhotoUseCase(properties, storage),
      inject: [PROPERTY_REPOSITORY, STORAGE_PORT],
    },
  ],
})
export class PropertiesModule {}
