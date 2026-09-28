import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ValidateSessionRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly userId!: string;
}

export class ValidateSessionResponse {
  @ApiProperty({ enum: [true] })
  public readonly active!: true;

  @ApiProperty({ enum: ['GUEST', 'OWNER', 'ADMIN'] })
  public readonly role!: 'GUEST' | 'OWNER' | 'ADMIN';
}

