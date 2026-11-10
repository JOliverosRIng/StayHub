import { BadRequestException } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function assertUuid(value: string | undefined, code: string): string {
  if (!value || !UUID.test(value)) throw new BadRequestException(code);
  return value;
}

export function assertBookingId(value: string | undefined): string {
  return assertUuid(value, 'INVALID_BOOKING_ID');
}
