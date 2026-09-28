import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshSessionRequest {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(32)
  public readonly refreshToken!: string;
}

