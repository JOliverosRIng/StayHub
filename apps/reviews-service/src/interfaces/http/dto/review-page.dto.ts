import { ApiProperty } from '@nestjs/swagger';

export class ReviewItemDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public propertyId!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5 })
  public rating!: number;

  @ApiProperty({ type: 'string', minLength: 1, maxLength: 2000 })
  public comment!: string;

  @ApiProperty({ format: 'date-time' })
  public createdAt!: string;
}

export class ReviewPageDto {
  @ApiProperty({ type: [ReviewItemDto] })
  public items!: ReviewItemDto[];

  @ApiProperty({ type: 'integer', minimum: 1 })
  public page!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100 })
  public pageSize!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  public total!: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  public totalPages!: number;
}
