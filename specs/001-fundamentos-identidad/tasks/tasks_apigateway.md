---
description: "Dependency-ordered tasks exclusively for Sprint 1 API Gateway Group"
---

# Tasks: Fundamentos e identidad — Grupo 1 API Gateway

**Input**: `plan.md`, `spec.md`, constitución, `tendencias.md` y contratos OpenAPI vigentes.

**Scope**: Este backlog implementa exclusivamente `apps/api-gateway`, su imagen, configuración,
contrato público y pruebas. Auth y Users aparecen solo como dependencias contractuales externas.
No incluye lógica de negocio, persistencia de dominio, cliente web ni broker asíncrono.

**Format**: `- [ ] GW-### [P?] [US?] descripción (Component; Trace; Depends on) in path`

- `[P]` significa que la tarea puede ejecutarse en paralelo tras sus dependencias.
- `[US1]`–`[US4]` trazan las historias de `spec.md`.
- `External dependency` exige coordinación, pero no autoriza cambios en aplicaciones ajenas.

## Phase 1: Setup del API Gateway

- [x] GW-001 Registrar `apps/api-gateway` como workspace NestJS 10/Node 20 con scripts de build, lint, typecheck y test (Component: Gateway workspace; Trace: Plan §1/§3, Constitution VI; Depends on: none) in `package.json`, `package-lock.json` and `nest-cli.json`
- [x] GW-002 Crear bootstrap y estructura vacía `application`, `infrastructure`, `interfaces` y `modules` para HTTPS 8080 (Component: Gateway structure; Trace: Plan §3; Depends on: GW-001) in `apps/api-gateway/src/main.ts`, `apps/api-gateway/src/app.module.ts` and `apps/api-gateway/src/{application,infrastructure,interfaces,modules}/`
- [x] GW-003 [P] Configurar TypeScript estricto, aliases por capa y build independiente (Component: Gateway toolchain; Trace: Constitution II/VI; Depends on: GW-001) in `apps/api-gateway/tsconfig.json`, `apps/api-gateway/tsconfig.build.json` and `tsconfig.base.json`
- [x] GW-004 [P] Configurar Jest/Supertest para unit, integration, contract, e2e, performance y security con cobertura afectada ≥70% (Component: Gateway test harness; Trace: Constitution VIII; Depends on: GW-001) in `apps/api-gateway/jest.config.ts` and `apps/api-gateway/test/{unit,integration,contract,e2e,performance,security}/setup.ts`
- [x] GW-005 [P] Documentar puerto, TLS, URLs Auth/Users, JWT, service-auth, Redis, proxies confiables, límites y OTLP sin secretos reales (Component: Gateway configuration; Trace: Plan §3/§7, Constitution V; Depends on: GW-001) in `.env.example` and `apps/api-gateway/README.md`
- [x] GW-006 [P] Crear Dockerfile multi-stage Node 20 con `npm ci`, build, usuario no root y healthcheck (Component: Gateway Docker image; Trace: Plan §7; Depends on: GW-001) in `infra/docker/gateway/Dockerfile` and `infra/docker/gateway/.dockerignore`
- [x] GW-007 Integrar únicamente `api-gateway` y su namespace Redis de borde con HTTPS 8080, red interna, readiness y `restart: always` (Component: Gateway Compose; Trace: Plan §7; Depends on: GW-002, GW-005–GW-006) in `docker-compose.yml`
- [x] GW-008 [P] Añadir CI exclusivo del Gateway para instalación bloqueada, lint, tipos, tests, cobertura, OpenAPI, rendimiento e imagen (Component: Gateway CI; Trace: Constitution VII–VIII; Depends on: GW-001, GW-004, GW-006) in `.github/workflows/ci.yml`

**Checkpoint**: El workspace compila y prueba sin implementar componentes de Auth o Users.

## Phase 2: Fundamentos bloqueantes

- [x] GW-009 Implementar configuración tipada con fallo de arranque ante ausencia de TLS, destinos, JWT, service-auth, Redis, proxies, límites u OTLP (Component: Gateway config; Trace: Plan §3, Constitution V; Depends on: GW-002, GW-005) in `apps/api-gateway/src/infrastructure/config/gateway-config.ts` and `apps/api-gateway/src/infrastructure/config/config.module.ts`
- [x] GW-010 Configurar `httpsOptions`, puerto 8080 y prefijo `/api/v1` sin listener HTTP público alternativo (Component: HTTPS bootstrap; Trace: Plan §3, Constitution V; Depends on: GW-009) in `apps/api-gateway/src/main.ts`
- [x] GW-011 [P] Implementar whitelist, rechazo de campos desconocidos y Problem Details con `traceId` (Component: Validation/errors; Trace: FR-003, FR-019, FR-024; Depends on: GW-002) in `apps/api-gateway/src/interfaces/http/validation.pipe.ts`, `apps/api-gateway/src/interfaces/http/problem.filter.ts` and `apps/api-gateway/src/interfaces/http/problem.mapper.ts`
- [x] GW-012 [P] Implementar trazas y logs JSON/OTLP con redacción de contraseña, correo, JWT, refresh, service JWT y foto (Component: Observability; Trace: FR-024, Constitution V; Depends on: GW-002) in `apps/api-gateway/src/infrastructure/observability/otel.ts`, `apps/api-gateway/src/infrastructure/observability/gateway-logger.ts` and `apps/api-gateway/src/interfaces/http/trace.interceptor.ts`
- [x] GW-013 [P] Implementar origen desde socket y aceptar IP reenviada solo desde proxy inmediato permitido (Component: Trusted origin; Trace: Plan §3; Depends on: GW-009) in `apps/api-gateway/src/infrastructure/security/trusted-origin.service.ts`
- [x] GW-014 [P] Implementar Redis de borde con operaciones atómicas, namespaces propios y fallo cerrado para rate limits (Component: Gateway Redis; Trace: Plan §3/§7; Depends on: GW-009) in `apps/api-gateway/src/infrastructure/cache/gateway-redis.module.ts` and `apps/api-gateway/src/infrastructure/cache/rate-limit.store.ts`
- [x] GW-015 [P] Implementar service JWT breve con issuer, audience y scope por destino, separado del bearer (Component: Service authentication; Trace: Plan §6, Constitution V; Depends on: GW-009) in `apps/api-gateway/src/infrastructure/service-auth/service-token.provider.ts`
- [x] GW-016 [P] Implementar Passport JWT RS256 con `kid`, issuer/audience, expiración y claims `sub,sid,role,jti,iat,exp` (Component: User authentication; Trace: FR-009–FR-012; Depends on: GW-009) in `apps/api-gateway/src/modules/auth/jwt.strategy.ts` and `apps/api-gateway/src/modules/auth/gateway-auth.module.ts`
- [x] GW-017 [P] Eliminar cabeceras de identidad, forwarding y service-auth aportadas por clientes antes del routing (Component: Header security; Trace: FR-011–FR-013, FR-024; Depends on: GW-002) in `apps/api-gateway/src/interfaces/http/security/identity-header.interceptor.ts`
- [x] GW-018 [P] Implementar cliente REST base con service JWT, `traceId`, timeout, circuit breaker, allowlist de cabeceras y reintentos solo idempotentes (Component: HTTP clients; Trace: Plan §6, Constitution IV; Depends on: GW-015, GW-017) in `apps/api-gateway/src/infrastructure/http/service-client.base.ts`
- [x] GW-019 [P] Mapear errores remotos a Problem Details preservando 400/401/403/404/409/413/415/429/503 (Component: Remote errors; Trace: FR-008, FR-012–FR-013, FR-019–FR-024; Depends on: GW-011, GW-018) in `apps/api-gateway/src/infrastructure/http/remote-problem.mapper.ts`
- [x] GW-020 [P] Implementar `/health/live` y `/health/ready` exigiendo configuración, TLS, Redis y destinos resolubles (Component: Gateway health; Trace: Plan §7; Depends on: GW-009–GW-010, GW-014) in `apps/api-gateway/src/modules/health/health.controller.ts` and `apps/api-gateway/src/modules/health/health.module.ts`
- [x] GW-021 [P] Inicializar Swagger público con bearer, refresh cookie, idempotencia, multipart, límites y Problem Details (Component: Public OpenAPI; Trace: Constitution VII; Depends on: GW-002) in `apps/api-gateway/src/interfaces/openapi/openapi.factory.ts` and `apps/api-gateway/src/interfaces/openapi/openapi.module.ts`
- [x] GW-022 Integrar módulos, filtros, validación, trazas y stripping global en `AppModule` (Component: Gateway bootstrap; Trace: Plan §3, Constitution II/V; Depends on: GW-009–GW-021) in `apps/api-gateway/src/app.module.ts` and `apps/api-gateway/src/main.ts`

**Checkpoint**: Los fundamentos están listos y bloquean el inicio de las historias.

## Phase 3: User Story 1 — Registrar una cuenta con rol (P1) — entrada RQ-02

**Independent Test**: Con stub Auth, `POST /api/v1/auth/register` valida forma, idempotencia y
límite por origen, y conserva 201/400/409/429/503.

- [x] GW-023 [P] [US1] Escribir primero contrato de registro con `Idempotency-Key` UUID, contraseña exacta 8–128, roles `GUEST|OWNER`, DTO cerrado y 201/400/409/429/503 (Component: Register contract; Trace: RQ-02, FR-001–FR-006; Depends on: GW-004, GW-021) in `apps/api-gateway/test/contract/register.contract.spec.ts`
- [x] GW-024 [P] [US1] Escribir primero pruebas del límite rodante 10 solicitudes/origen/10 minutos, undécima 429 y `Retry-After` exacto (Component: Register rate limit; Trace: FR-001–FR-006; Depends on: GW-004, GW-013–GW-014) in `apps/api-gateway/test/unit/registration-rate-limit.spec.ts`
- [x] GW-025 [P] [US1] Escribir primero integración de service JWT, timeout, circuit breaker, reintento idempotente y mapeo Auth (Component: Auth registration integration; Trace: RQ-02, FR-005–FR-006; Depends on: GW-018–GW-019) in `apps/api-gateway/test/integration/auth-registration-client.spec.ts`
- [x] GW-026 [P] [US1] Implementar DTO público cerrado sin normalizar contraseña ni aceptar `ADMIN` (Component: Register DTO; Trace: FR-001–FR-003; Depends on: GW-011, GW-023) in `apps/api-gateway/src/modules/auth/dto/register.dto.ts`
- [x] GW-027 [P] [US1] Implementar límite Redis de registro por origen confiable con fallo cerrado 503 (Component: Register edge policy; Trace: Plan §3; Depends on: GW-013–GW-014, GW-024) in `apps/api-gateway/src/modules/rate-limit/registration-rate-limit.service.ts`
- [x] GW-028 [P] [US1] Implementar cliente `POST /internal/v1/registrations` con service JWT, idempotencia y timeout (Component: Auth registration client; Trace: RQ-02, FR-001–FR-006; Depends on: GW-018, GW-025; External dependency: G3 congela contrato Auth) in `apps/api-gateway/src/infrastructure/http/auth-registration.client.ts`
- [x] GW-029 [US1] Implementar `POST /api/v1/auth/register` sin lógica de saga (Component: Register route; Trace: RQ-02, FR-001–FR-006; Depends on: GW-026–GW-028) in `apps/api-gateway/src/modules/auth/register.controller.ts`
- [x] GW-030 [US1] Sincronizar registro público y ejecutar suites unit/contract/integration/security sin declarar completa la saga externa (Component: Register verification; Trace: RQ-02, SC-002–SC-003, SC-007; Depends on: GW-023–GW-029) in `specs/001-fundamentos-identidad/contracts/openapi-public.yaml`, `apps/api-gateway/src/interfaces/openapi/register.openapi.ts` and `apps/api-gateway/test/`

## Phase 4: User Story 2 — Iniciar y renovar sesión (P1)

**Independent Test**: Con stub Auth, login/refresh/validate conservan expiraciones, cookie,
límites, 401/403/429/503 e introspección fail-closed.

- [x] GW-031 [P] [US2] Escribir primero contrato de login, refresh y validate con bearer/cookie y 200/400/401/429/503 (Component: Session contract; Trace: FR-007–FR-013; Depends on: GW-004, GW-021) in `apps/api-gateway/test/contract/session.contract.spec.ts`
- [x] GW-032 [P] [US2] Escribir primero pruebas del límite 30 intentos/origen/5 minutos, intento 31 con `Retry-After` y 503 sin Redis (Component: Login rate limit; Trace: FR-007–FR-008; Depends on: GW-004, GW-013–GW-014) in `apps/api-gateway/test/unit/login-rate-limit.spec.ts`
- [x] GW-033 [P] [US2] Escribir primero pruebas para JWT inválido 401, rol no permitido 403, mismatch claim/sesión y Auth caído 503 (Component: Auth guards; Trace: FR-009–FR-013, SC-003; Depends on: GW-004, GW-016) in `apps/api-gateway/test/security/auth-guards.spec.ts`
- [x] GW-034 [P] [US2] Escribir primero pruebas de cookie `Secure`, `HttpOnly`, `SameSite=Strict`, path restringido, rotación y limpieza (Component: Refresh cookie; Trace: FR-010, FR-024; Depends on: GW-004) in `apps/api-gateway/test/unit/refresh-cookie.spec.ts`
- [x] GW-035 [P] [US2] Implementar límite Redis de login por origen con fallo cerrado 503 (Component: Login edge policy; Trace: FR-007–FR-008; Depends on: GW-013–GW-014, GW-032) in `apps/api-gateway/src/modules/rate-limit/login-rate-limit.service.ts`
- [x] GW-036 [P] [US2] Implementar clientes Auth para login, refresh e introspección mediante contratos internos (Component: Auth session clients; Trace: FR-007–FR-013; Depends on: GW-018, GW-031; External dependency: G3 entrega contratos internos) in `apps/api-gateway/src/infrastructure/http/auth-session.client.ts`
- [ ] GW-037 [P] [US2] Implementar cookie refresh sin exponer token en cuerpo/logs públicos (Component: Refresh cookie service; Trace: FR-010, FR-024; Depends on: GW-034) in `apps/api-gateway/src/modules/auth/refresh-cookie.service.ts`
- [ ] GW-038 [US2] Implementar login y refresh públicos con límite, cliente Auth y cookie segura (Component: Session routes; Trace: FR-007–FR-012; Depends on: GW-035–GW-037) in `apps/api-gateway/src/modules/auth/login.controller.ts` and `apps/api-gateway/src/modules/auth/refresh.controller.ts`
- [ ] GW-039 [US2] Implementar introspección de `sid/sub` y comparar rol JWT con rol autoritativo, fallando cerrado (Component: Session introspection; Trace: FR-009–FR-013; Depends on: GW-016, GW-033, GW-036) in `apps/api-gateway/src/modules/auth/session-introspection.service.ts`
- [ ] GW-040 [US2] Implementar guards globales con metadata pública, precedencia 401→403 e introspección obligatoria (Component: Authorization; Trace: FR-011–FR-013; Depends on: GW-033, GW-039) in `apps/api-gateway/src/modules/auth/access.guard.ts`, `apps/api-gateway/src/modules/auth/roles.guard.ts` and `apps/api-gateway/src/modules/auth/public.decorator.ts`
- [ ] GW-041 [US2] Implementar `GET /api/v1/auth/validate` con proyección pública mínima (Component: Validate route; Trace: FR-009–FR-013, FR-024; Depends on: GW-039–GW-040) in `apps/api-gateway/src/modules/auth/validate.controller.ts`
- [ ] GW-042 [US2] Sincronizar OpenAPI y cerrar suites unit/contract/integration/security de sesión (Component: Session verification; Trace: FR-007–FR-013, SC-002–SC-003, SC-007; Depends on: GW-031–GW-041) in `specs/001-fundamentos-identidad/contracts/openapi-public.yaml`, `apps/api-gateway/src/interfaces/openapi/session.openapi.ts` and `apps/api-gateway/test/`

## Phase 5: User Story 3 — Consultar y editar perfil propio (P2) — entrada RQ-01

**Independent Test**: Con stubs Auth/Users, perfil/foto exige sesión válida, transmite solo
contexto autorizado y aplica exactamente 5.000.000 bytes.

- [ ] GW-043 [P] [US3] Escribir primero contrato GET/PATCH perfil y GET foto con bearer, multipart, 5.000.000 bytes y 200/400/401/403/404/409/413/415/503 (Component: Profile contract; Trace: RQ-01, FR-014–FR-019, FR-023; Depends on: GW-004, GW-021) in `apps/api-gateway/test/contract/profile.contract.spec.ts`
- [ ] GW-044 [P] [US3] Escribir primero pruebas de streaming, backpressure, cancelación y límite decimal exacto (Component: Profile streaming; Trace: FR-015–FR-019, FR-024; Depends on: GW-004, GW-018) in `apps/api-gateway/test/integration/profile-streaming.spec.ts`
- [ ] GW-045 [P] [US3] Escribir primero pruebas de timeout/circuit breaker Users y 503 sin respuesta parcial (Component: Users failures; Trace: FR-018–FR-019, FR-023; Depends on: GW-018–GW-019) in `apps/api-gateway/test/integration/users-client-failure.spec.ts`
- [ ] GW-046 [P] [US3] Implementar cliente Users para GET/PATCH/foto reenviando bearer validado y `traceId` (Component: Users client; Trace: RQ-01, FR-011–FR-019; Depends on: GW-017–GW-019, GW-043; External dependency: G2 congela contrato Users) in `apps/api-gateway/src/infrastructure/http/users-profile.client.ts`
- [ ] GW-047 [P] [US3] Implementar límite exactamente 5.000.000 bytes y streaming sin base64/buffering completo (Component: Body limits; Trace: FR-015–FR-016, FR-024; Depends on: GW-044) in `apps/api-gateway/src/modules/users/profile-streaming.interceptor.ts`
- [ ] GW-048 [US3] Implementar GET/PATCH perfil y GET foto con Passport, introspección, cliente Users y allowlist de cabeceras (Component: Profile routes; Trace: RQ-01, FR-011–FR-024; Depends on: GW-040, GW-045–GW-047) in `apps/api-gateway/src/modules/users/profile.controller.ts` and `apps/api-gateway/src/modules/users/profile-photo.controller.ts`
- [ ] GW-049 [US3] Sincronizar perfil/foto pública a 5.000.000 bytes y cerrar suites unit/contract/integration (Component: Profile verification; Trace: RQ-01, SC-002–SC-005, SC-007; Depends on: GW-043–GW-048) in `specs/001-fundamentos-identidad/contracts/openapi-public.yaml`, `apps/api-gateway/src/interfaces/openapi/profile.openapi.ts` and `apps/api-gateway/test/`

## Phase 6: User Story 4 — Restringir modificaciones no autorizadas (P2)

- [ ] GW-050 [P] [US4] Escribir primero pruebas de spoofing para headers de identidad, forwarding, service JWT y bearer duplicado (Component: Header spoofing; Trace: FR-011–FR-013, FR-020–FR-024; Depends on: GW-004, GW-017) in `apps/api-gateway/test/security/identity-header-spoofing.spec.ts`
- [ ] GW-051 [P] [US4] Escribir primero pruebas de ownership para identidad ajena existente/inexistente y ADMIN sin privilegio implícito, exigiendo 403 antes de Users (Component: Ownership tests; Trace: FR-020–FR-021, SC-004; Depends on: GW-004, GW-040) in `apps/api-gateway/test/security/profile-ownership.spec.ts`
- [ ] GW-052 [US4] Endurecer stripping y allowlists para satisfacer spoofing sin reenviar identidad no validada (Component: Header hardening; Trace: FR-011–FR-013, FR-024; Depends on: GW-050, GW-017) in `apps/api-gateway/src/interfaces/http/security/identity-header.interceptor.ts`
- [ ] GW-053 [US4] Implementar ownership `principal.sub == route.userId` antes de Users y devolver 403 uniforme incluido ADMIN (Component: Ownership guard; Trace: FR-020–FR-021; Depends on: GW-051, GW-040) in `apps/api-gateway/src/modules/users/profile-ownership.guard.ts`
- [ ] GW-054 [US4] Aplicar Passport→introspección→ownership→routing y cerrar Swagger/suites 401/403 (Component: Authorization pipeline; Trace: FR-011–FR-013, FR-020–FR-024, SC-003–SC-004; Depends on: GW-052–GW-053) in `apps/api-gateway/src/modules/users/users-proxy.module.ts`, `apps/api-gateway/src/interfaces/openapi/profile.openapi.ts` and `apps/api-gateway/test/`

## Phase 7: Integración y cierre

- [ ] GW-055 [P] Validar drift del Swagger público, todas las operaciones, límite decimal único de fotografía y ausencia de secretos (Component: Public contract drift; Trace: Constitution V/VII; Depends on: GW-030, GW-042, GW-049, GW-054) in `scripts/validate-public-openapi.mjs` and `apps/api-gateway/test/contract/openapi-drift.spec.ts`
- [ ] GW-056 [P] Ejecutar contrato consumer Gateway→Auth para registro/login/refresh/validate (Component: Gateway-Auth contract; Trace: RQ-02, FR-001–FR-013; Depends on: GW-030, GW-042; External dependency: G3 entrega provider) in `apps/api-gateway/test/contract/auth.consumer.spec.ts`
- [ ] GW-057 [P] Ejecutar contrato consumer Gateway→Users para perfil/foto, multipart 5.000.000 y streaming (Component: Gateway-Users contract; Trace: RQ-01, FR-011–FR-024; Depends on: GW-049, GW-054; External dependency: G2 entrega provider) in `apps/api-gateway/test/contract/users.consumer.spec.ts`
- [ ] GW-058 Verificar integración real Gateway↔Auth con cookie, 401/429/503 y rol de sesión (Component: Gateway-Auth integration; Trace: RQ-02, FR-001–FR-013; Depends on: GW-056; External dependency: G3 operativo) in `apps/api-gateway/test/integration/gateway-auth.spec.ts`
- [ ] GW-059 Verificar integración real Gateway↔Users con ownership, 5.000.000 bytes, timeout y 503 (Component: Gateway-Users integration; Trace: RQ-01, FR-011–FR-024; Depends on: GW-057; External dependency: G2 operativo) in `apps/api-gateway/test/integration/gateway-users.spec.ts`
- [ ] GW-060 Ejecutar E2E HTTPS registro→login→perfil→cambio de correo→refresh y negativos, corrigiendo solo Gateway (Component: Sprint 1 E2E; Trace: RQ-01, RQ-02, SC-002–SC-004; Depends on: GW-058–GW-059; External dependency: G2/G3 operativos) in `apps/api-gateway/test/e2e/identity.e2e-spec.ts`
- [ ] GW-061 [P] Ejecutar k6 HTTPS con 100 usuarios ACTIVE, warm-up 30 s y dos escenarios de 25 req/s por 2 minutos, p95<500 ms y errores<1% (Component: Gateway performance; Trace: Plan §8; Depends on: GW-058–GW-059) in `apps/api-gateway/test/performance/identity.k6.js` and `.github/workflows/ci.yml`
- [ ] GW-062 [P] Auditar respuestas/logs/trazas para ausencia de contraseña, tokens, hashes, correo, foto y headers internos (Component: Secret audit; Trace: FR-024, Constitution V; Depends on: GW-030, GW-042, GW-049, GW-054) in `apps/api-gateway/test/security/no-secret-leakage.spec.ts`
- [ ] GW-063 Verificar imagen no root, TLS, healthchecks, Redis, red interna, puerto 8080 y `restart: always` (Component: Runtime verification; Trace: Plan §7; Depends on: GW-007, GW-020, GW-058–GW-059) in `apps/api-gateway/test/integration/gateway-compose.spec.ts`
- [ ] GW-064 Registrar cobertura ≥70%, contratos, seguridad, rendimiento, Compose, revisión y trazabilidad sin anticipar evidencia externa (Component: Gateway Definition of Done; Trace: SC-002–SC-004, SC-007, Constitution VIII; Depends on: GW-055–GW-063) in `specs/001-fundamentos-identidad/validation-report.md`

## Dependencies & Parallelization

- Phase 1 → Phase 2 → historias. US1 y US2 pueden repartirse después de fundamentos.
- US3 depende del pipeline `GW-040`; US4 endurece US3.
- Las suites con stubs no esperan a G2/G3; `GW-056`–`GW-060` sí requieren sus entregables.
- Dos personas pueden dividir configuración/clientes y pruebas/Redis, convergiendo en `GW-022`.

## Definition of Done

- Solo `/api/v1` queda expuesto por HTTPS 8080 y no hay lógica de Auth o Users.
- Los siete endpoints públicos del Sprint 1 tienen routing, seguridad, errores y OpenAPI.
- El límite de fotografía es exactamente 5.000.000 bytes.
- No existen tareas de cliente web ni broker asíncrono.
- Pruebas unitarias, integración, contrato, E2E, rendimiento y seguridad pasan con cobertura ≥70%.
