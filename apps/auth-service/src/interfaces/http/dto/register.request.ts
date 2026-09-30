import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

function trimIfString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

@ApiSchema({ name: 'RegisterCommand' })
export class RegisterRequest {
  @ApiProperty({
    minLength: 2,
    maxLength: 100,
    description: 'Outer whitespace is trimmed before validation.',
  })
  @Transform(({ value }: { value: unknown }) => trimIfString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  public readonly name!: string;

  @ApiProperty({
    format: 'email',
    maxLength: 254,
    description: 'Outer whitespace is trimmed, then the address is lowercased for fingerprinting.',
  })
  @Transform(({ value }: { value: unknown }) => trimIfString(value))
  @IsEmail()
  @MaxLength(254)
  public readonly email!: string;

  @ApiProperty({
    format: 'password',
    minLength: 8,
    maxLength: 128,
    writeOnly: true,
    description:
      'Evaluated exactly as supplied; no trimming, case folding or Unicode normalization.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  public readonly password!: string;

  @ApiProperty({ enum: ['GUEST', 'OWNER'] })
  @IsIn(['GUEST', 'OWNER'])
  public readonly role!: 'GUEST' | 'OWNER';
}

