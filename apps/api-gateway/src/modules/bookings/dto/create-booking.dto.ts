import { IsDateString, IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateBookingDto {
  @IsUUID() public propertyId!: string;
  @IsUUID() public roomId!: string;
  @IsDateString({ strict: true }) public checkIn!: string;
  @IsDateString({ strict: true }) public checkOut!: string;
  @IsInt() @Min(1) @Max(100) public guests!: number;
}
