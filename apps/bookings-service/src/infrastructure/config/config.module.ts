import { Global, Module } from '@nestjs/common';
import { loadBookingsConfig, type BookingsConfig } from './bookings-config';
export const BOOKINGS_CONFIG = Symbol('BOOKINGS_CONFIG');
@Global() @Module({ providers: [{ provide: BOOKINGS_CONFIG, useFactory: (): BookingsConfig => loadBookingsConfig() }], exports: [BOOKINGS_CONFIG] })
export class BookingsConfigModule {}
