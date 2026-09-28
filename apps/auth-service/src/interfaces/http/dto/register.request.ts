import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterRequest {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  public readonly name!: string;

  @ApiProperty({ format: 'email', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  public readonly email!: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  public readonly password!: string;

  @ApiProperty({ enum: ['GUEST', 'OWNER'] })
  @IsIn(['GUEST', 'OWNER'])
  public readonly role!: 'GUEST' | 'OWNER';
}

