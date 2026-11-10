import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateReviewDto {
  @IsUUID()
  public bookingId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  public rating!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/u)
  public comment!: string;
}
