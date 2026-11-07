export const SERVICE_TOKEN_PORT = Symbol('SERVICE_TOKEN_PORT');
export interface ServiceTokenPort { getToken(): Promise<string>; }
