import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelBookingDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) public reason?: string;
}
