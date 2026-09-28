import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginRequest {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  public readonly email!: string;

  @ApiProperty({ format: 'password', maxLength: 128, writeOnly: true })
  @IsString()
  @MaxLength(128)
  public readonly password!: string;
}

export class SessionPrincipalResponse {
  @ApiProperty({ format: 'uuid' })
  public readonly userId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly sessionId!: string;

  @ApiProperty({ enum: ['GUEST', 'OWNER', 'ADMIN'] })
  public readonly role!: 'GUEST' | 'OWNER' | 'ADMIN';
}

export class InternalTokenPairResponse {
  @ApiProperty({ writeOnly: true })
  public readonly accessToken!: string;

  @ApiProperty({ writeOnly: true })
  public readonly refreshToken!: string;

  @ApiProperty({ enum: [3600] })
  public readonly expiresIn!: 3600;

  @ApiProperty({ format: 'date-time' })
  public readonly absoluteExpiresAt!: string;

  @ApiProperty({ type: SessionPrincipalResponse })
  public readonly principal!: SessionPrincipalResponse;
}

