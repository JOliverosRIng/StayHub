export interface ServiceTokenPort { getToken(audience: string, scope: string): Promise<string>; }
export const SERVICE_TOKEN_PORT = Symbol('SERVICE_TOKEN_PORT');
