import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public bookingId!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  public rating!: number;

  @ApiProperty({ type: 'string', minLength: 1, maxLength: 2000 })
  @IsString()
  public comment!: string;
}
