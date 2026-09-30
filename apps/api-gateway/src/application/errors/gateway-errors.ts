export class GatewayDependencyError extends Error {
  public constructor(public readonly dependency: string) {
    super(`Dependencia no disponible: ${dependency}`);
    this.name = 'GatewayDependencyError';
  }
}
