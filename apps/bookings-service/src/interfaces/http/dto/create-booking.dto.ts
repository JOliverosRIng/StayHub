import { IsDateString, IsInt, IsUUID, Max, Min } from 'class-validator';
import { BadRequestException } from '@nestjs/common';

export class CreateBookingDto {
  @IsUUID() public propertyId!: string;
  @IsUUID() public roomId!: string;
  @IsDateString({ strict: true }) public checkIn!: string;
  @IsDateString({ strict: true }) public checkOut!: string;
  @IsInt() @Min(1) @Max(100) public guests!: number;
}

export function assertIdempotencyKey(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9._:-]{16,128}$/u.test(value)) throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
  return value;
}
