import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { SearchQueryInput } from '@search/domain/search-query';
export class SearchQueryDto implements SearchQueryInput {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) public q?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) public location?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) public minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) public maxPrice?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/u) public currency?: string;
  @IsOptional() @IsDateString({ strict: true }) public checkIn?: string;
  @IsOptional() @IsDateString({ strict: true }) public checkOut?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public guests?: number;
  @IsOptional() @Transform(({ value }: TransformFnParams): unknown[] => Array.isArray(value) ? value as unknown[] : [value]) @IsArray() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(60, { each: true }) public amenities?: readonly string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) public pageSize?: number;
}
