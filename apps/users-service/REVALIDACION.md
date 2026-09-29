# Revalidación G2 — 2026-09-29

Fuente: constitución, descripción/Depends on/in path de tasks_userService.md y
OpenAPI Users. No se usa users-service-status.md ni commits como evidencia.
Rutas src/test/prisma relativas a apps/users-service salvo indicación expresa.
No hay extensions.yml. PostgreSQL 16 de pruebas confirmado activo en
127.0.0.1:55432 mediante docker ps y pg_isready; no apagarlo.

## Línea base A

Ejecutados desde apps/users-service: npm run lint (0), npm run typecheck (0),
npm test -- --coverage (0). 24/24 suites, 148/148 pruebas; 34,574 s.
coverage/users/coverage-summary.json: 2026-09-29T14:31:36.5957435Z.
Sentencias 96,29% (676/702), ramas 90,37% (216/239), funciones 95,23% (120/126),
líneas 98,05% (504/514). Logs ignorados .artifacts/revalidation-baseline-*.
Las suites citadas abajo se ejecutaron en esta línea base; se inspeccionaron
directamente sus assertions. El orden TDD histórico no es verificable.

## B. Fases 1 y 2

| tarea | criterio | estado | evidencia archivo:línea | test/comando | commit |
|---|---|---|---|---|---|
| USR-001 | Workspace Users y comandos | CUMPLE | package.json:5-26 (raíz), package-lock.json:17-63, nest-cli.json:12 | línea base | bloque B |
| USR-002 | Capas/bootstrap 3002 | CUMPLE | src/main.ts:12-20; src/app.module.ts:10; infrastructure/config/users-config.ts:35 | http-adapters, config | bloque B |
| USR-003 | Strict/aliases | CUMPLE | tsconfig.base.json:6-23; tsconfig.json:2-8; tsconfig.build.json:4-7 | typecheck | bloque B |
| USR-004 | Cuatro proyectos y cobertura | CUMPLE | jest.config.ts:5-17; test/*/setup.ts:1-2 | línea base | bloque B |
| USR-005 | Config documentada | CUMPLE | .env.example:2-23; README.md:7-29 | config | bloque B |
| USR-006 | Prisma Users y migraciones | CUMPLE | prisma/schema.prisma:1-4,44-46; package.json:20-22 | migrations-health (deploy real) | bloque B |
| USR-007 | Imagen no root | NO VERIFICABLE | infra/docker/users/Dockerfile:1-30; .dockerignore:1-11 | revisión estática correcta; arranque K pendiente | bloque B |
| USR-008 | Compose privado | NO VERIFICABLE | docker-compose.yml:1-68; secrets, volumen, internal y restart explícitos | runtime K pendiente | bloque B |
| USR-009 | Etapas CI | CUMPLE | .github/workflows/ci.yml:29-38: ci/generate/deploy/lint/types/unit/combined/build/drift/image | inspección; CI remota no ejecutada | bloque B |
| USR-010 | Config falla cerrada | CUMPLE | src/infrastructure/config/users-config.ts:12-42; config.module.ts:4 | config.spec.ts:14-22 exige cada variable, db ajena, puerto/tamaño | bloque B |
| USR-011 | Lifecycle/users_db | CUMPLE | src/infrastructure/persistence/prisma/prisma.service.ts:6-13; prisma.module.ts:4 | migrations-health | bloque B |
| USR-012 | Whitelist/Problem | CUMPLE | src/interfaces/http/validation.pipe.ts:4-7; problem.filter.ts:10-13; problem.mapper.ts:4-10 | http-adapters:34-47,69-87; secret-leakage:18-23 | bloque B |
| USR-013 | Logs sin PII y OTLP | CUMPLE | src/infrastructure/logging/users-logger.ts:6-17; observability/otel.ts:5-14; interfaces/http/trace.interceptor.ts:11-20 | secret-leakage:6-16; telemetry:5-12 export real local | bloque B |
| USR-014 | Service JWT y scopes | CUMPLE | src/interfaces/http/guards/service-auth.guard.ts:7-20; infrastructure/security/service-jwt.verifier.ts:6-11 | service-auth:18-22; shared verifier inspeccionado | bloque B |
| USR-015 | Bearer/claims canónicos | CUMPLE | src/interfaces/http/auth/jwt.strategy.ts:13-18; modules/users-auth.module.ts:5 | jwt-hardening; revisión US4 pendiente | bloque B |
| USR-016 | Puertos sin Prisma | CUMPLE | src/application/ports/user.repository.ts:1-12; profile.repository.ts:1-11; unit-of-work.ts:3 | typecheck y lectura directa | bloque B |
| USR-017 | Errores sin HTTP en dominio | CUMPLE | src/domain/shared/domain-error.ts:1-6; application/errors/users-errors.ts:1 | registration-policy/http-adapters | bloque B |
| USR-018 | Ready exige migraciones | CUMPLE | src/modules/health/health.controller.ts:7-10; prisma.service.ts:11-12 | migrations-health:7-11 invalida finished_at y espera 503 | bloque B |
| USR-019 | Swagger interno/UI dev | CUMPLE | src/interfaces/openapi/openapi.factory.ts:4-11; openapi.module.ts:1-3; main.ts:17 | http-adapters:94-96 | bloque B |
| USR-020 | Harness real aislado | CUMPLE | test/integration/postgres.setup.ts:16-43; fixtures/users.fixture.ts:4-18 | migrations-health:13-22; schema por suite, reset por prueba, helper rollback comprobado | bloque B |
| USR-021 | Integración global/3002 privado | NO VERIFICABLE | src/app.module.ts:10; main.ts:16-20; configure-http.ts:7-10; compose sin ports | http-adapters verde; runtime K pendiente | bloque B |

## Punto retomable

USR-026: CORREGIDA (cobertura): service-auth.spec.ts:20 añade firma RSA no confiable
con claims correctos; 7/7 casos verdes. Producción ya rechaza. Se guarda el cambio
legítimo antes de mutar el verificador; falta demostrar detección de firma omitida.

Inspección B terminada. US1 en revisión: leídos tests registro, dominio, repositorio,
controladores y migración inicial. Pendiente: use cases registration, reforzar
cobertura de firma service JWT y carrera activate/cancel; continuar C y D, E, F,
G, K, H (12 mutaciones), I y cierre J. Ninguna mutación realizada todavía.
