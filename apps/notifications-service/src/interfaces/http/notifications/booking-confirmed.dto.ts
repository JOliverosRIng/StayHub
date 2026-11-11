import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

const DECIMAL_AMOUNT = /^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/;

export class BookingConfirmedDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId!: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Length(1, 100)
  bookingId!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @Length(1, 120)
  propertyName!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @Length(1, 120)
  roomName!: string;

  @ApiProperty({ example: '2026-12-01', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkIn!: string;

  @ApiProperty({ example: '2026-12-03', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  checkOut!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  guests!: number;

  @ApiProperty({ example: '250000.00', pattern: DECIMAL_AMOUNT.source, description: 'Decimal amount as a string to preserve precision.' })
  @IsString()
  @Matches(DECIMAL_AMOUNT)
  totalPrice!: string;

  @ApiProperty({ format: 'date-time', description: 'Check-in instant with its UTC offset; used to calculate the reminder time.' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/)
  checkInAt!: string;
}
