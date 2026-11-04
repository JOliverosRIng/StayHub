import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ServiceJwtVerifier } from "@search/infrastructure/security/service-jwt.verifier";
import { SearchApplicationError } from "@search/application/errors/search-errors";
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  public constructor(private readonly verifier: ServiceJwtVerifier) {}
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { servicePrincipal?: unknown }>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer "))
      throw new SearchApplicationError(
        "SEARCH_UNAUTHENTICATED",
        "A service token is required.",
        401,
      );
    request.servicePrincipal = await this.verifier.verify(
      authorization.slice(7),
    );
    return true;
  }
}
