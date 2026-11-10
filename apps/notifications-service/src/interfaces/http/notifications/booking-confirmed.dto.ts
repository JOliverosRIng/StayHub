import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

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
  roomTitle!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  roomLocation!: string;

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

  @ApiProperty({ minimum: 0, maximum: 9999999999.99, multipleOf: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalPrice!: number;

  @ApiProperty({ format: 'date-time', description: 'Check-in instant with its UTC offset; used to calculate the reminder time.' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/)
  checkInAt!: string;
}
