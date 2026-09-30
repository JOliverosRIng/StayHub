import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

@ApiSchema({ name: 'ValidateSessionCommand' })
export class ValidateSessionRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly userId!: string;
}

@ApiSchema({ name: 'SessionValidation' })
export class ValidateSessionResponse {
  @ApiProperty({ enum: [true] })
  public readonly active!: true;

  @ApiProperty({ enum: ['GUEST', 'OWNER', 'ADMIN'] })
  public readonly role!: 'GUEST' | 'OWNER' | 'ADMIN';
}

