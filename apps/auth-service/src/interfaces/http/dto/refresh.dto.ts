import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

@ApiSchema({ name: 'RotateRefreshCommand' })
export class RefreshSessionRequest {
  @ApiProperty({
    writeOnly: true,
    minLength: 32,
    description: 'Raw refresh token sent in the body (no cookie); persisted only as an HMAC.',
  })
  @IsString()
  @MinLength(32)
  public readonly refreshToken!: string;
}
