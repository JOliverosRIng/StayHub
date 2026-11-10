import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsDefined,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PaymentMethodDto {
  @ApiProperty({ type: 'string', enum: ['CARD_TOKEN'] })
  @IsString()
  @Equals('CARD_TOKEN')
  type!: 'CARD_TOKEN';

  @ApiProperty({
    type: 'string',
    minLength: 8,
    maxLength: 64,
    pattern: '^(?!\\d{13,19}$)[A-Za-z0-9_-]+$',
    description: 'Token opaco. Nunca un número de tarjeta.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?!\d{13,19}$)[A-Za-z0-9_-]+$/)
  token!: string;
}

export class CreatePaymentDto {
  @ApiProperty({ type: 'string', format: 'uuid' })
  @IsUUID('4')
  bookingId!: string;

  @ApiProperty({ type: 'string', format: 'uuid' })
  @IsUUID('4')
  payerUserId!: string;

  @ApiProperty({ type: 'integer', format: 'int64', minimum: 1, maximum: 9_000_000_000_000 })
  @IsInt()
  @Min(1)
  @Max(9_000_000_000_000)
  amountMinor!: number;

  @ApiProperty({ type: 'string', enum: ['COP', 'USD'] })
  @IsIn(['COP', 'USD'])
  currency!: 'COP' | 'USD';

  @ApiProperty({ type: () => PaymentMethodDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PaymentMethodDto)
  paymentMethod!: PaymentMethodDto;
}
