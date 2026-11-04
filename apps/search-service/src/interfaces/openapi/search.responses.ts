import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchItem {
  @ApiProperty({ format: 'uuid' }) public accommodationId!: string;
  @ApiProperty() public name!: string;
  @ApiProperty() public location!: string;
  @ApiProperty() public minNightlyPrice!: number;
  @ApiProperty({ pattern: '^[A-Z]{3}$' }) public currency!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) public capacity!: number;
  @ApiProperty({ type: [String] }) public amenities!: string[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uri' }) public primaryPhotoUrl!: string | null;
  @ApiProperty() public relevance!: number;
}
export class SearchResponse {
  @ApiProperty({ type: [SearchItem] }) public items!: SearchItem[];
  @ApiProperty({ type: 'integer', minimum: 1 }) public page!: number;
  @ApiProperty({ type: 'integer', minimum: 1 }) public pageSize!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) public total!: number;
  @ApiProperty() public hasNext!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, enum: ['PROJECTED', null], description: 'Snapshot [checkIn, checkOut); no es disponibilidad autoritativa ni confirmación de reserva.' }) public availabilityKind!: 'PROJECTED' | null;
}
export class FieldError {
  @ApiProperty() public field!: string;
  @ApiProperty() public code!: string;
}
export class Problem {
  @ApiProperty() public type!: string;
  @ApiProperty() public title!: string;
  @ApiProperty({ type: 'integer' }) public status!: number;
  @ApiProperty() public detail!: string;
  @ApiProperty() public instance!: string;
  @ApiProperty() public code!: string;
  @ApiProperty() public traceId!: string;
  @ApiProperty({ type: [FieldError] }) public errors!: FieldError[];
}
