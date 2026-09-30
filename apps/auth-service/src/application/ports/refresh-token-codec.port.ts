export const REFRESH_TOKEN_CODEC = Symbol('REFRESH_TOKEN_CODEC');

export interface RefreshTokenCodec {
  generateRawToken(): string;
  hash(rawToken: string): string;
}
