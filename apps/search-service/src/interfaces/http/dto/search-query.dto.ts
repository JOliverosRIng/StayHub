import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type, type TransformFnParams } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type { SearchQueryInput } from "@search/domain/search-query";
export class SearchQueryDto implements SearchQueryInput {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) @ApiPropertyOptional({ minLength: 1, maxLength: 200, description: 'Texto indexado; relevancia ponderada A/B/C y desempate por accommodationId.' }) public q?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @ApiPropertyOptional({ minLength: 1, maxLength: 120, description: 'Ubicación textual; se combina con los demás filtros mediante AND.' }) public location?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional({ minimum: 0, description: 'Requiere currency; debe ser menor o igual a maxPrice.' }) public minPrice?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional({ minimum: 0, description: 'Requiere currency; debe ser mayor o igual a minPrice.' }) public maxPrice?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/u) @ApiPropertyOptional({ pattern: '^[A-Z]{3}$', description: 'Requerida cuando se envía minPrice o maxPrice. Sin conversión de monedas.' }) public currency?: string;
  @IsOptional() @IsDateString({ strict: true }) @ApiPropertyOptional({ type: String, format: 'date', description: 'Enviar con checkOut; inicio inclusivo de disponibilidad proyectada.' }) public checkIn?: string;
  @IsOptional() @IsDateString({ strict: true }) @ApiPropertyOptional({ type: String, format: 'date', description: 'Enviar con checkIn y debe ser posterior; fin exclusivo, no confirma una reserva.' }) public checkOut?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @ApiPropertyOptional({ type: 'integer', minimum: 1 }) public guests?: number;
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown[] =>
    Array.isArray(value) ? (value as unknown[]) : [value],
  )
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(60, { each: true })
  @ApiPropertyOptional({ type: 'array', maxItems: 20, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 60 }, description: 'Amenidades normalizadas; el alojamiento debe contener todas.' }) public amenities?: readonly string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 }) public page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, default: 20 }) public pageSize?: number;
}
