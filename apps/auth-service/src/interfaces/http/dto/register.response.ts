import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'UserSummary' })
export class RegisterResponse {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty({ format: 'email' })
  public readonly email!: string;

  @ApiProperty({ enum: ['GUEST', 'OWNER', 'ADMIN'] })
  public readonly role!: 'GUEST' | 'OWNER';
}

