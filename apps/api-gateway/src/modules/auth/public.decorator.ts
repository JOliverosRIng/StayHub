import { SetMetadata, type CustomDecorator, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

/**
 * GW-040 — Metadato de ruta pública (FR-011–FR-013).
 *
 * La autenticación es global por omisión: toda operación protegida exige bearer válido Y sesión
 * activa (FR-011). El único modo de abrir una ruta es declararla explícitamente con `@Public()`,
 * de modo que el conjunto de rutas anónimas sea una decisión visible y auditable en el controlador
 * y no una excepción implícita en el guard.
 *
 * Solo las rutas públicas del Sprint 1 lo usan: `POST /auth/register`, `POST /auth/login`,
 * `POST /auth/refresh` y las sondas operativas `/health/live` y `/health/ready`. Ninguna ruta de
 * negocio (`/auth/validate`, perfil y foto) se marca: requieren sesión válida.
 */

export const IS_PUBLIC_KEY = 'gateway:is-public';

/** Marca el controlador o el manejador como accesible sin sesión. */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);

/** Resuelve el metadato con precedencia manejador → clase, como hace Nest en los pipes. */
export function isPublicRoute(reflector: Reflector, context: ExecutionContext): boolean {
  return (
    reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]) ===
    true
  );
}
