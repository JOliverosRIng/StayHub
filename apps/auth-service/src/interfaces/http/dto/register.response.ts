import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponse {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty()
  public readonly name!: string;

  @ApiProperty({ format: 'email' })
  public readonly email!: string;

  @ApiProperty({ enum: ['GUEST', 'OWNER'] })
  public readonly role!: 'GUEST' | 'OWNER';
}

