import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

function trimIfString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

@ApiSchema({ name: 'LoginCommand' })
export class LoginRequest {
  @ApiProperty({
    format: 'email',
    maxLength: 254,
    description: 'Outer whitespace is trimmed before validation; the use case lowercases it.',
  })
  @Transform(({ value }: { value: unknown }) => trimIfString(value))
  @IsEmail()
  @MaxLength(254)
  public readonly email!: string;

  @ApiProperty({
    format: 'password',
    maxLength: 128,
    writeOnly: true,
    description: 'Evaluated exactly as supplied; no trimming, case folding or Unicode normalization.',
  })
  @IsString()
  @MaxLength(128)
  public readonly password!: string;
}

@ApiSchema({ name: 'SessionPrincipal' })
export class SessionPrincipalResponse {
  @ApiProperty({ format: 'uuid' })
  public readonly userId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly sessionId!: string;

  @ApiProperty({ enum: ['GUEST', 'OWNER', 'ADMIN'] })
  public readonly role!: 'GUEST' | 'OWNER' | 'ADMIN';
}

@ApiSchema({ name: 'InternalTokenPair' })
export class InternalTokenPairResponse {
  @ApiProperty()
  public readonly accessToken!: string;

  @ApiProperty()
  public readonly refreshToken!: string;

  @ApiProperty({ type: 'integer', enum: [3600] })
  public readonly expiresIn!: 3600;

  @ApiProperty({ format: 'date-time' })
  public readonly absoluteExpiresAt!: string;

  @ApiProperty({ type: SessionPrincipalResponse })
  public readonly principal!: SessionPrincipalResponse;
}
