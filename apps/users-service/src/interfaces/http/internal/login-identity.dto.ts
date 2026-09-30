import { Allow } from 'class-validator';
export class LoginIdentityDto { @Allow() email!: string }
