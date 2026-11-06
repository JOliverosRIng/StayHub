import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BOOKING_STATUSES, type BookingStatus } from '@bookings/domain/bookings/booking-status';

export class OwnerBookingHistoryQueryDto {
  @ApiPropertyOptional({ type: String, format: 'date' }) @IsOptional() @IsDateString({ strict: true }) public from?: string;
  @ApiPropertyOptional({ type: String, format: 'date' }) @IsOptional() @IsDateString({ strict: true }) public to?: string;
  @ApiPropertyOptional({ enum: [...BOOKING_STATUSES] }) @IsOptional() @IsIn([...BOOKING_STATUSES]) public status?: BookingStatus;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() public guestId?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) public pageSize = 20;
}
