import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type, type TransformFnParams } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type { SuggestionQueryInput } from "@search/domain/suggestion";

export class SuggestQueryDto implements SuggestionQueryInput {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @ApiProperty({ minLength: 1, maxLength: 120 })
  public q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @ApiPropertyOptional({
    type: "integer",
    minimum: 1,
    maximum: 20,
    default: 10,
  })
  public limit?: number;
}
