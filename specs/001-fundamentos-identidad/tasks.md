---
description: "Compiled dependency-ordered tasks for Sprint 1 backend groups"
---

# Tasks: Fundamentos e identidad — Sprint 1 backend

**Sources of truth**: `plan.md`, `spec.md`, la constitución, `tendencias.md`, `data-model.md`, contratos OpenAPI y los tres backlogs por grupo.

**Organization**: Compilado ejecutable de Grupo 1 API Gateway, Grupo 2 users-service y Grupo 3 auth-service. Los IDs `GW-`, `USR-` y `AUTH-` se preservan para mantener dependencias y trazabilidad. Los archivos bajo `tasks/` son los backlogs editables por grupo; este archivo es su punto de entrada canónico para Spec Kit.

**Tests**: Son obligatorias según cada backlog y la constitución. Las pruebas de cada historia se escriben primero y deben fallar por el comportamiento ausente.

**Scope**: Backend exclusivo del Sprint 1. No incorpora cliente web ni broker asíncrono.

## Grupo 1 — API Gateway

**Fuente**: `specs/001-fundamentos-identidad/tasks/tasks_apigateway.md`

**Input**: `plan.md`, `spec.md`, constitución, `tendencias.md` y contratos OpenAPI vigentes.

**Scope**: Este backlog implementa exclusivamente `apps/api-gateway`, su imagen, configuración,
contrato público y pruebas. Auth y Users aparecen solo como dependencias contractuales externas.
No incluye lógica de negocio, persistencia de dominio, cliente web ni broker asíncrono.

**Format**: `- [ ] GW-### [P?] [US?] descripción (Component; Trace; Depends on) in path`

- `[P]` significa que la tarea puede ejecutarse en paralelo tras sus dependencias.
- `[US1]`–`[US4]` trazan las historias de `spec.md`.
- `External dependency` exige coordinación, pero no autoriza cambios en aplicaciones ajenas.

### Phase 1: Setup del API Gateway

- [ ] GW-001 Registrar `apps/api-gateway` como workspace NestJS 10/Node 20 con scripts de build, lint, typecheck y test (Component: Gateway workspace; Trace: Plan §1/§3, Constitution VI; Depends on: none) in `package.json`, `package-lock.json` and `nest-cli.json`
- [ ] GW-002 Crear bootstrap y estructura vacía `application`, `infrastructure`, `interfaces` y `modules` para HTTPS 8080 (Component: Gateway structure; Trace: Plan §3; Depends on: GW-001) in `apps/api-gateway/src/main.ts`, `apps/api-gateway/src/app.module.ts` and `apps/api-gateway/src/{application,infrastructure,interfaces,modules}/`
- [ ] GW-003 [P] Configurar TypeScript estricto, aliases por capa y build independiente (Component: Gateway toolchain; Trace: Constitution II/VI; Depends on: GW-001) in `apps/api-gateway/tsconfig.json`, `apps/api-gateway/tsconfig.build.json` and `tsconfig.base.json`
- [ ] GW-004 [P] Configurar Jest/Supertest para unit, integration, contract, e2e, performance y security con cobertura afectada ≥70% (Component: Gateway test harness; Trace: Constitution VIII; Depends on: GW-001) in `apps/api-gateway/jest.config.ts` and `apps/api-gateway/test/{unit,integration,contract,e2e,performance,security}/setup.ts`
- [ ] GW-005 [P] Documentar puerto, TLS, URLs Auth/Users, JWT, service-auth, Redis, proxies confiables, límites y OTLP sin secretos reales (Component: Gateway configuration; Trace: Plan §3/§7, Constitution V; Depends on: GW-001) in `.env.example` and `apps/api-gateway/README.md`
- [ ] GW-006 [P] Crear Dockerfile multi-stage Node 20 con `npm ci`, build, usuario no root y healthcheck (Component: Gateway Docker image; Trace: Plan §7; Depends on: GW-001) in `infra/docker/gateway/Dockerfile` and `infra/docker/gateway/.dockerignore`
- [ ] GW-007 Integrar únicamente `api-gateway` y su namespace Redis de borde con HTTPS 8080, red interna, readiness y `restart: always` (Component: Gateway Compose; Trace: Plan §7; Depends on: GW-002, GW-005–GW-006) in `docker-compose.yml`
- [ ] GW-008 [P] Añadir CI exclusivo del Gateway para instalación bloqueada, lint, tipos, tests, cobertura, OpenAPI, rendimiento e imagen (Component: Gateway CI; Trace: Constitution VII–VIII; Depends on: GW-001, GW-004, GW-006) in `.github/workflows/ci.yml`

**Checkpoint**: El workspace compila y prueba sin implementar componentes de Auth o Users.

### Phase 2: Fundamentos bloqueantes

- [ ] GW-009 Implementar configuración tipada con fallo de arranque ante ausencia de TLS, destinos, JWT, service-auth, Redis, proxies, límites u OTLP (Component: Gateway config; Trace: Plan §3, Constitution V; Depends on: GW-002, GW-005) in `apps/api-gateway/src/infrastructure/config/gateway-config.ts` and `apps/api-gateway/src/infrastructure/config/config.module.ts`
- [ ] GW-010 Configurar `httpsOptions`, puerto 8080 y prefijo `/api/v1` sin listener HTTP público alternativo (Component: HTTPS bootstrap; Trace: Plan §3, Constitution V; Depends on: GW-009) in `apps/api-gateway/src/main.ts`
- [ ] GW-011 [P] Implementar whitelist, rechazo de campos desconocidos y Problem Details con `traceId` (Component: Validation/errors; Trace: FR-003, FR-019, FR-024; Depends on: GW-002) in `apps/api-gateway/src/interfaces/http/validation.pipe.ts`, `apps/api-gateway/src/interfaces/http/problem.filter.ts` and `apps/api-gateway/src/interfaces/http/problem.mapper.ts`
- [ ] GW-012 [P] Implementar trazas y logs JSON/OTLP con redacción de contraseña, correo, JWT, refresh, service JWT y foto (Component: Observability; Trace: FR-024, Constitution V; Depends on: GW-002) in `apps/api-gateway/src/infrastructure/observability/otel.ts`, `apps/api-gateway/src/infrastructure/observability/gateway-logger.ts` and `apps/api-gateway/src/interfaces/http/trace.interceptor.ts`
- [ ] GW-013 [P] Implementar origen desde socket y aceptar IP reenviada solo desde proxy inmediato permitido (Component: Trusted origin; Trace: Plan §3; Depends on: GW-009) in `apps/api-gateway/src/infrastructure/security/trusted-origin.service.ts`
- [ ] GW-014 [P] Implementar Redis de borde con operaciones atómicas, namespaces propios y fallo cerrado para rate limits (Component: Gateway Redis; Trace: Plan §3/§7; Depends on: GW-009) in `apps/api-gateway/src/infrastructure/cache/gateway-redis.module.ts` and `apps/api-gateway/src/infrastructure/cache/rate-limit.store.ts`
- [ ] GW-015 [P] Implementar service JWT breve con issuer, audience y scope por destino, separado del bearer (Component: Service authentication; Trace: Plan §6, Constitution V; Depends on: GW-009) in `apps/api-gateway/src/infrastructure/service-auth/service-token.provider.ts`
- [ ] GW-016 [P] Implementar Passport JWT RS256 con `kid`, issuer/audience, expiración y claims `sub,sid,role,jti,iat,exp` (Component: User authentication; Trace: FR-009–FR-012; Depends on: GW-009) in `apps/api-gateway/src/modules/auth/jwt.strategy.ts` and `apps/api-gateway/src/modules/auth/gateway-auth.module.ts`
- [ ] GW-017 [P] Eliminar cabeceras de identidad, forwarding y service-auth aportadas por clientes antes del routing (Component: Header security; Trace: FR-011–FR-013, FR-024; Depends on: GW-002) in `apps/api-gateway/src/interfaces/http/security/identity-header.interceptor.ts`
- [ ] GW-018 [P] Implementar cliente REST base con service JWT, `traceId`, timeout, circuit breaker, allowlist de cabeceras y reintentos solo idempotentes (Component: HTTP clients; Trace: Plan §6, Constitution IV; Depends on: GW-015, GW-017) in `apps/api-gateway/src/infrastructure/http/service-client.base.ts`
- [ ] GW-019 [P] Mapear errores remotos a Problem Details preservando 400/401/403/404/409/413/415/429/503 (Component: Remote errors; Trace: FR-008, FR-012–FR-013, FR-019–FR-024; Depends on: GW-011, GW-018) in `apps/api-gateway/src/infrastructure/http/remote-problem.mapper.ts`
- [ ] GW-020 [P] Implementar `/health/live` y `/health/ready` exigiendo configuración, TLS, Redis y destinos resolubles (Component: Gateway health; Trace: Plan §7; Depends on: GW-009–GW-010, GW-014) in `apps/api-gateway/src/modules/health/health.controller.ts` and `apps/api-gateway/src/modules/health/health.module.ts`
- [ ] GW-021 [P] Inicializar Swagger público con bearer, refresh cookie, idempotencia, multipart, límites y Problem Details (Component: Public OpenAPI; Trace: Constitution VII; Depends on: GW-002) in `apps/api-gateway/src/interfaces/openapi/openapi.factory.ts` and `apps/api-gateway/src/interfaces/openapi/openapi.module.ts`
- [ ] GW-022 Integrar módulos, filtros, validación, trazas y stripping global en `AppModule` (Component: Gateway bootstrap; Trace: Plan §3, Constitution II/V; Depends on: GW-009–GW-021) in `apps/api-gateway/src/app.module.ts` and `apps/api-gateway/src/main.ts`

**Checkpoint**: Los fundamentos están listos y bloquean el inicio de las historias.

### Phase 3: User Story 1 — Registrar una cuenta con rol (P1) — entrada RQ-02

**Independent Test**: Con stub Auth, `POST /api/v1/auth/register` valida forma, idempotencia y
límite por origen, y conserva 201/400/409/429/503.

- [ ] GW-023 [P] [US1] Escribir primero contrato de registro con `Idempotency-Key` UUID, contraseña exacta 8–128, roles `GUEST|OWNER`, DTO cerrado y 201/400/409/429/503 (Component: Register contract; Trace: RQ-02, FR-001–FR-006; Depends on: GW-004, GW-021) in `apps/api-gateway/test/contract/register.contract.spec.ts`
- [ ] GW-024 [P] [US1] Escribir primero pruebas del límite rodante 10 solicitudes/origen/10 minutos, undécima 429 y `Retry-After` exacto (Component: Register rate limit; Trace: FR-001–FR-006; Depends on: GW-004, GW-013–GW-014) in `apps/api-gateway/test/unit/registration-rate-limit.spec.ts`
- [ ] GW-025 [P] [US1] Escribir primero integración de service JWT, timeout, circuit breaker, reintento idempotente y mapeo Auth (Component: Auth registration integration; Trace: RQ-02, FR-005–FR-006; Depends on: GW-018–GW-019) in `apps/api-gateway/test/integration/auth-registration-client.spec.ts`
- [ ] GW-026 [P] [US1] Implementar DTO público cerrado sin normalizar contraseña ni aceptar `ADMIN` (Component: Register DTO; Trace: FR-001–FR-003; Depends on: GW-011, GW-023) in `apps/api-gateway/src/modules/auth/dto/register.dto.ts`
- [ ] GW-027 [P] [US1] Implementar límite Redis de registro por origen confiable con fallo cerrado 503 (Component: Register edge policy; Trace: Plan §3; Depends on: GW-013–GW-014, GW-024) in `apps/api-gateway/src/modules/rate-limit/registration-rate-limit.service.ts`
- [ ] GW-028 [P] [US1] Implementar cliente `POST /internal/v1/registrations` con service JWT, idempotencia y timeout (Component: Auth registration client; Trace: RQ-02, FR-001–FR-006; Depends on: GW-018, GW-025; External dependency: G3 congela contrato Auth) in `apps/api-gateway/src/infrastructure/http/auth-registration.client.ts`
- [ ] GW-029 [US1] Implementar `POST /api/v1/auth/register` sin lógica de saga (Component: Register route; Trace: RQ-02, FR-001–FR-006; Depends on: GW-026–GW-028) in `apps/api-gateway/src/modules/auth/register.controller.ts`
- [ ] GW-030 [US1] Sincronizar registro público y ejecutar suites unit/contract/integration/security sin declarar completa la saga externa (Component: Register verification; Trace: RQ-02, SC-002–SC-003, SC-007; Depends on: GW-023–GW-029) in `specs/001-fundamentos-identidad/contracts/openapi-public.yaml`, `apps/api-gateway/src/interfaces/openapi/register.openapi.ts` and `apps/api-gateway/test/`

### Phase 4: User Story 2 — Iniciar y renovar sesión (P1)

**Independent Test**: Con stub Auth, login/refresh/validate conservan expiraciones, cookie,
límites, 401/403/429/503 e introspección fail-closed.

- [ ] GW-031 [P] [US2] Escribir primero contrato de login, refresh y validate con bearer/cookie y 200/400/401/429/503 (Component: Session contract; Trace: FR-007–FR-013; Depends on: GW-004, GW-021) in `apps/api-gateway/test/contract/session.contract.spec.ts`
- [ ] GW-032 [P] [US2] Escribir primero pruebas del límite 30 intentos/origen/5 minutos, intento 31 con `Retry-After` y 503 sin Redis (Component: Login rate limit; Trace: FR-007–FR-008; Depends on: GW-004, GW-013–GW-014) in `apps/api-gateway/test/unit/login-rate-limit.spec.ts`
- [ ] GW-033 [P] [US2] Escribir primero pruebas para JWT inválido 401, rol no permitido 403, mismatch claim/sesión y Auth caído 503 (Component: Auth guards; Trace: FR-009–FR-013, SC-003; Depends on: GW-004, GW-016) in `apps/api-gateway/test/security/auth-guards.spec.ts`
- [ ] GW-034 [P] [US2] Escribir primero pruebas de cookie `Secure`, `HttpOnly`, `SameSite=Strict`, path restringido, rotación y limpieza (Component: Refresh cookie; Trace: FR-010, FR-024; Depends on: GW-004) in `apps/api-gateway/test/unit/refresh-cookie.spec.ts`
- [ ] GW-035 [P] [US2] Implementar límite Redis de login por origen con fallo cerrado 503 (Component: Login edge policy; Trace: FR-007–FR-008; Depends on: GW-013–GW-014, GW-032) in `apps/api-gateway/src/modules/rate-limit/login-rate-limit.service.ts`
- [ ] GW-036 [P] [US2] Implementar clientes Auth para login, refresh e introspección mediante contratos internos (Component: Auth session clients; Trace: FR-007–FR-013; Depends on: GW-018, GW-031; External dependency: G3 entrega contratos internos) in `apps/api-gateway/src/infrastructure/http/auth-session.client.ts`
- [ ] GW-037 [P] [US2] Implementar cookie refresh sin exponer token en cuerpo/logs públicos (Component: Refresh cookie service; Trace: FR-010, FR-024; Depends on: GW-034) in `apps/api-gateway/src/modules/auth/refresh-cookie.service.ts`
- [ ] GW-038 [US2] Implementar login y refresh públicos con límite, cliente Auth y cookie segura (Component: Session routes; Trace: FR-007–FR-012; Depends on: GW-035–GW-037) in `apps/api-gateway/src/modules/auth/login.controller.ts` and `apps/api-gateway/src/modules/auth/refresh.controller.ts`
- [ ] GW-039 [US2] Implementar introspección de `sid/sub` y comparar rol JWT con rol autoritativo, fallando cerrado (Component: Session introspection; Trace: FR-009–FR-013; Depends on: GW-016, GW-033, GW-036) in `apps/api-gateway/src/modules/auth/session-introspection.service.ts`
- [ ] GW-040 [US2] Implementar guards globales con metadata pública, precedencia 401→403 e introspección obligatoria (Component: Authorization; Trace: FR-011–FR-013; Depends on: GW-033, GW-039) in `apps/api-gateway/src/modules/auth/access.guard.ts`, `apps/api-gateway/src/modules/auth/roles.guard.ts` and `apps/api-gateway/src/modules/auth/public.decorator.ts`
- [ ] GW-041 [US2] Implementar `GET /api/v1/auth/validate` con proyección pública mínima (Component: Validate route; Trace: FR-009–FR-013, FR-024; Depends on: GW-039–GW-040) in `apps/api-gateway/src/modules/auth/validate.controller.ts`
- [ ] GW-042 [US2] Sincronizar OpenAPI y cerrar suites unit/contract/integration/security de sesión (Component: Session verification; Trace: FR-007–FR-013, SC-002–SC-003, SC-007; Depends on: GW-031–GW-041) in `specs/001-fundamentos-identidad/contracts/openapi-public.yaml`, `apps/api-gateway/src/interfaces/openapi/session.openapi.ts` and `apps/api-gateway/test/`

### Phase 5: User Story 3 — Consultar y editar perfil propio (P2) — entrada RQ-01

**Independent Test**: Con stubs Auth/Users, perfil/foto exige sesión válida, transmite solo
contexto autorizado y aplica exactamente 5.000.000 bytes.

- [ ] GW-043 [P] [US3] Escribir primero contrato GET/PATCH perfil y GET foto con bearer, multipart, 5.000.000 bytes y 200/400/401/403/404/409/413/415/503 (Component: Profile contract; Trace: RQ-01, FR-014–FR-019, FR-023; Depends on: GW-004, GW-021) in `apps/api-gateway/test/contract/profile.contract.spec.ts`
- [ ] GW-044 [P] [US3] Escribir primero pruebas de streaming, backpressure, cancelación y límite decimal exacto (Component: Profile streaming; Trace: FR-015–FR-019, FR-024; Depends on: GW-004, GW-018) in `apps/api-gateway/test/integration/profile-streaming.spec.ts`
- [ ] GW-045 [P] [US3] Escribir primero pruebas de timeout/circuit breaker Users y 503 sin respuesta parcial (Component: Users failures; Trace: FR-018–FR-019, FR-023; Depends on: GW-018–GW-019) in `apps/api-gateway/test/integration/users-client-failure.spec.ts`
- [ ] GW-046 [P] [US3] Implementar cliente Users para GET/PATCH/foto reenviando bearer validado y `traceId` (Component: Users client; Trace: RQ-01, FR-011–FR-019; Depends on: GW-017–GW-019, GW-043; External dependency: G2 congela contrato Users) in `apps/api-gateway/src/infrastructure/http/users-profile.client.ts`
- [ ] GW-047 [P] [US3] Implementar límite exactamente 5.000.000 bytes y streaming sin base64/buffering completo (Component: Body limits; Trace: FR-015–FR-016, FR-024; Depends on: GW-044) in `apps/api-gateway/src/modules/users/profile-streaming.interceptor.ts`
- [ ] GW-048 [US3] Implementar GET/PATCH perfil y GET foto con Passport, introspección, cliente Users y allowlist de cabeceras (Component: Profile routes; Trace: RQ-01, FR-011–FR-024; Depends on: GW-040, GW-045–GW-047) in `apps/api-gateway/src/modules/users/profile.controller.ts` and `apps/api-gateway/src/modules/users/profile-photo.controller.ts`
- [ ] GW-049 [US3] Sincronizar perfil/foto pública a 5.000.000 bytes y cerrar suites unit/contract/integration (Component: Profile verification; Trace: RQ-01, SC-002–SC-005, SC-007; Depends on: GW-043–GW-048) in `specs/001-fundamentos-identidad/contracts/openapi-public.yaml`, `apps/api-gateway/src/interfaces/openapi/profile.openapi.ts` and `apps/api-gateway/test/`

### Phase 6: User Story 4 — Restringir modificaciones no autorizadas (P2)

- [ ] GW-050 [P] [US4] Escribir primero pruebas de spoofing para headers de identidad, forwarding, service JWT y bearer duplicado (Component: Header spoofing; Trace: FR-011–FR-013, FR-020–FR-024; Depends on: GW-004, GW-017) in `apps/api-gateway/test/security/identity-header-spoofing.spec.ts`
- [ ] GW-051 [P] [US4] Escribir primero pruebas de ownership para identidad ajena existente/inexistente y ADMIN sin privilegio implícito, exigiendo 403 antes de Users (Component: Ownership tests; Trace: FR-020–FR-021, SC-004; Depends on: GW-004, GW-040) in `apps/api-gateway/test/security/profile-ownership.spec.ts`
- [ ] GW-052 [US4] Endurecer stripping y allowlists para satisfacer spoofing sin reenviar identidad no validada (Component: Header hardening; Trace: FR-011–FR-013, FR-024; Depends on: GW-050, GW-017) in `apps/api-gateway/src/interfaces/http/security/identity-header.interceptor.ts`
- [ ] GW-053 [US4] Implementar ownership `principal.sub == route.userId` antes de Users y devolver 403 uniforme incluido ADMIN (Component: Ownership guard; Trace: FR-020–FR-021; Depends on: GW-051, GW-040) in `apps/api-gateway/src/modules/users/profile-ownership.guard.ts`
- [ ] GW-054 [US4] Aplicar Passport→introspección→ownership→routing y cerrar Swagger/suites 401/403 (Component: Authorization pipeline; Trace: FR-011–FR-013, FR-020–FR-024, SC-003–SC-004; Depends on: GW-052–GW-053) in `apps/api-gateway/src/modules/users/users-proxy.module.ts`, `apps/api-gateway/src/interfaces/openapi/profile.openapi.ts` and `apps/api-gateway/test/`

### Phase 7: Integración y cierre

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

### Dependencies & Parallelization

- Phase 1 → Phase 2 → historias. US1 y US2 pueden repartirse después de fundamentos.
- US3 depende del pipeline `GW-040`; US4 endurece US3.
- Las suites con stubs no esperan a G2/G3; `GW-056`–`GW-060` sí requieren sus entregables.
- Dos personas pueden dividir configuración/clientes y pruebas/Redis, convergiendo en `GW-022`.

### Definition of Done

- Solo `/api/v1` queda expuesto por HTTPS 8080 y no hay lógica de Auth o Users.
- Los siete endpoints públicos del Sprint 1 tienen routing, seguridad, errores y OpenAPI.
- El límite de fotografía es exactamente 5.000.000 bytes.
- No existen tareas de cliente web ni broker asíncrono.
- Pruebas unitarias, integración, contrato, E2E, rendimiento y seguridad pasan con cobertura ≥70%.

---

## Grupo 2 — users-service

**Fuente**: `specs/001-fundamentos-identidad/tasks/tasks_userService.md`

**Input**: `plan.md`, `spec.md`, la constitución, `tendencias.md`, `data-model.md`, el contrato
Users existente y el estado greenfield del repositorio.

**Scope**: Este backlog pertenece exclusivamente al Grupo 2. Implementa `users-service`,
`users_db`, sus migraciones, contenedor, contratos y pruebas. Auth y Gateway aparecen únicamente
como dependencias contractuales externas en la fase final.

**Tests**: Son obligatorias por solicitud del usuario y por los Principios V, VII y VIII de la
constitución. Dentro de cada historia se escriben primero y deben fallar por la conducta ausente.

**Format**: `- [ ] USR-### [P?] [US?] descripción (Component; Trace; Depends on) in path`

- `[P]` indica ejecución paralela únicamente después de completar sus dependencias declaradas.
- `[US1]`–`[US4]` enlazan la tarea con las historias del `spec.md`.
- `External dependency` identifica contratos o servicios entregados por G1/G3; no autoriza
  cambios en sus aplicaciones.

### Phase 1: Setup de `users-service`

**Purpose**: Crear exclusivamente el workspace, toolchain y contenedores base de Users.

- [ ] USR-001 Registrar `apps/users-service` como workspace NestJS 10/Node 20 con scripts de build, lint, typecheck, Prisma y test sin crear paquetes de otros servicios (Component: Users workspace; Trace: Plan §1/§4, Constitution VI; Depends on: none) in `package.json`, `package-lock.json` and `nest-cli.json`
- [ ] USR-002 Crear bootstrap y estructura vacía `domain`, `application`, `infrastructure`, `interfaces` y `modules` para Users en puerto interno 3002 (Component: Users structure; Trace: Plan §2/§4; Depends on: USR-001) in `apps/users-service/src/main.ts`, `apps/users-service/src/app.module.ts` and `apps/users-service/src/{domain,application,infrastructure,interfaces,modules}/`
- [ ] USR-003 [P] Configurar TypeScript estricto, aliases por capa y build independiente sin importar NestJS/Prisma desde dominio (Component: Users toolchain; Trace: Constitution II/VI; Depends on: USR-001) in `apps/users-service/tsconfig.json`, `apps/users-service/tsconfig.build.json` and `tsconfig.base.json`
- [ ] USR-004 [P] Configurar Jest/Supertest y proyectos unit/integration/contract/security con umbral de cobertura afectada ≥70% (Component: Users test harness; Trace: Constitution VIII; Depends on: USR-001) in `apps/users-service/jest.config.ts` and `apps/users-service/test/{unit,integration,contract,security}/setup.ts`
- [ ] USR-005 [P] Documentar variables exclusivas de Users: puerto 3002, `users_db`, JWT público, service-auth, límite 5.000.000 bytes y OTLP, sin secretos reales (Component: Users configuration; Trace: Plan §4/§7, Constitution V; Depends on: USR-001) in `.env.example` and `apps/users-service/README.md`
- [ ] USR-006 [P] Configurar Prisma 6.x únicamente para PostgreSQL 16, cliente local y comandos `generate`, `migrate dev` y `migrate deploy`, prohibiendo `db push` en runtime (Component: Users ORM; Trace: Plan §2/§4; Depends on: USR-001) in `apps/users-service/prisma/schema.prisma` and `apps/users-service/package.json`
- [ ] USR-007 [P] Crear Dockerfile multi-stage Node 20 con `npm ci`, generación Prisma, build del workspace, usuario no root y healthcheck compatible (Component: Users Docker image; Trace: Plan §7; Depends on: USR-001, USR-006) in `infra/docker/users/Dockerfile` and `infra/docker/users/.dockerignore`
- [ ] USR-008 Integrar únicamente `users-service`, `users-db` y `users-migrate` con volumen/credenciales propios, red interna, readiness y política restart explícita (Component: Users Compose; Trace: Plan §7, Constitution III; Depends on: USR-002, USR-005–USR-007) in `docker-compose.yml`
- [ ] USR-009 [P] Añadir etapas CI exclusivas de Users para instalación bloqueada, Prisma generate/migrate, lint, tipos, tests, cobertura, OpenAPI y build de imagen (Component: Users CI; Trace: Constitution VII–VIII; Depends on: USR-001, USR-004, USR-006–USR-007) in `.github/workflows/ci.yml`

**Checkpoint**: El workspace Users compila, Prisma genera cliente, la imagen se construye y el
harness de pruebas arranca sin requerir Auth o Gateway implementados.

---

### Phase 2: Fundamentos bloqueantes de `users-service`

**Purpose**: Establecer configuración, persistencia, seguridad, errores y documentación común.

**Critical**: Ninguna historia comienza hasta completar esta fase.

- [ ] USR-010 Implementar configuración tipada y validada con fallo de arranque si faltan URL/credenciales de `users_db`, JWT issuer/audience/clave pública, service-auth, puerto, carga máxima u OTLP (Component: Users config; Trace: Plan §4, Constitution V; Depends on: USR-002, USR-005) in `apps/users-service/src/infrastructure/config/users-config.ts` and `apps/users-service/src/infrastructure/config/config.module.ts`
- [ ] USR-011 Implementar `PrismaModule` y adaptador de conexión exclusivamente a `users_db`, con lifecycle, transacciones locales y cero acceso cross-database (Component: Users persistence; Trace: Constitution II–III; Depends on: USR-006, USR-010) in `apps/users-service/src/infrastructure/persistence/prisma/prisma.service.ts` and `apps/users-service/src/infrastructure/persistence/prisma/prisma.module.ts`
- [ ] USR-012 [P] Implementar `ValidationPipe` con whitelist/rechazo de campos desconocidos y Problem Details `type,title,status,detail,instance,code,traceId,errors[]` sin datos sensibles (Component: Users HTTP validation/errors; Trace: FR-019, FR-024, Constitution V; Depends on: USR-002) in `apps/users-service/src/interfaces/http/validation.pipe.ts`, `apps/users-service/src/interfaces/http/problem.filter.ts` and `apps/users-service/src/interfaces/http/problem.mapper.ts`
- [ ] USR-013 [P] Implementar `traceId`, logs JSON/OTLP y redacción de correo, JWT, service JWT, foto y cualquier dato sensible (Component: Users observability; Trace: FR-024, Constitution V; Depends on: USR-002) in `apps/users-service/src/infrastructure/observability/otel.ts`, `apps/users-service/src/infrastructure/logging/users-logger.ts` and `apps/users-service/src/interfaces/http/trace.interceptor.ts`
- [ ] USR-014 [P] Implementar guard receptor de service JWT con issuer, audience, scope, firma y expiración, diferenciando scopes de registro y lookup (Component: Users service authentication; Trace: Plan §2/§6, Constitution V; Depends on: USR-010) in `apps/users-service/src/interfaces/http/guards/service-auth.guard.ts` and `apps/users-service/src/infrastructure/security/service-jwt.verifier.ts`
- [ ] USR-015 [P] Implementar Passport JWT para bearer de usuario con RS256 fijo, `kid`, issuer/audience, expiración y claims canónicos `sub,sid,role,jti,iat,exp`, sin confiar en headers de identidad (Component: Users user authentication; Trace: FR-011–FR-013; Depends on: USR-010) in `apps/users-service/src/interfaces/http/auth/jwt.strategy.ts` and `apps/users-service/src/modules/users-auth.module.ts`
- [ ] USR-016 [P] Definir puertos de repositorio y unidad de trabajo para identidad/perfil/foto sin tipos Prisma en dominio o aplicación (Component: Users application ports; Trace: Constitution II/VI; Depends on: USR-002) in `apps/users-service/src/application/ports/user.repository.ts`, `apps/users-service/src/application/ports/profile.repository.ts` and `apps/users-service/src/application/ports/unit-of-work.ts`
- [ ] USR-017 [P] Definir errores de dominio/aplicación para validación, conflicto de email, versión obsoleta, estado, ownership y recurso ausente con mapeo HTTP fuera del dominio (Component: Users errors; Trace: FR-004–FR-005, FR-016–FR-023; Depends on: USR-002) in `apps/users-service/src/domain/shared/domain-error.ts` and `apps/users-service/src/application/errors/users-errors.ts`
- [ ] USR-018 [P] Implementar `/health/live` y `/health/ready`, donde readiness exige configuración válida, conexión a `users_db` y migración aplicada (Component: Users health; Trace: Plan §7; Depends on: USR-010–USR-011) in `apps/users-service/src/modules/health/health.controller.ts` and `apps/users-service/src/modules/health/health.module.ts`
- [ ] USR-019 [P] Inicializar Swagger interno para servidor `http://users-service:3002`, bearer, service JWT, multipart y Problem Details, con UI solo en desarrollo (Component: Users OpenAPI; Trace: Constitution VII; Depends on: USR-002) in `apps/users-service/src/interfaces/openapi/openapi.factory.ts` and `apps/users-service/src/interfaces/openapi/openapi.module.ts`
- [ ] USR-020 [P] Crear harness PostgreSQL 16 aislado con migraciones reales, rollback por prueba y fixtures sintéticos, sin mocks de persistencia en suites integration (Component: Users database tests; Trace: Constitution VIII; Depends on: USR-004, USR-006) in `apps/users-service/test/integration/postgres.setup.ts` and `apps/users-service/test/fixtures/users.fixture.ts`
- [ ] USR-021 Integrar los módulos base en `AppModule`, aplicar validación/errores/trazas globales y garantizar que el puerto 3002 no se publica fuera de la red interna (Component: Users bootstrap; Trace: Plan §4/§7; Depends on: USR-010–USR-020) in `apps/users-service/src/app.module.ts` and `apps/users-service/src/main.ts`

**Checkpoint**: Users dispone de configuración, Prisma, contratos base, auth de servicio/usuario,
errores, observabilidad, health y pruebas PostgreSQL reutilizables.

---

### Phase 3: User Story 1 — Registrar una cuenta con rol (Priority: P1) — parte Users de RQ-02

**Goal**: Crear, activar o cancelar una identidad idempotente bajo coordinación externa, sin
almacenar contraseña ni coordinar la saga.

**Independent Test**: Con service JWT sintético, los endpoints internos crean un único User
`PENDING`, activan/cancelan idempotentemente y nunca hacen visible/autenticable un estado parcial.

#### Tests for User Story 1

- [ ] USR-022 [P] [US1] Escribir primero pruebas de contrato para POST `/internal/v1/registrations`, POST `/internal/v1/registrations/{registrationId}/activate` y POST `/internal/v1/registrations/{registrationId}/cancel` con service JWT, DTO cerrado y respuestas 201/200/204/400/404/409 (Component: Registration contract; Trace: RQ-02, FR-001–FR-006; Depends on: USR-004, USR-014, USR-019) in `apps/users-service/test/contract/registration.contract.spec.ts`
- [ ] USR-023 [P] [US1] Escribir primero pruebas unitarias de `trim().toLowerCase()`, nombre requerido 2–100 tras trim, correo máximo 254, roles públicos solo `GUEST|OWNER`, reconocimiento interno de `ADMIN` y estados `PENDING|ACTIVE|CANCELLED` (Component: Registration domain; Trace: FR-001–FR-004, BR-001–BR-002, BR-006; Depends on: USR-004) in `apps/users-service/test/unit/registration-policy.spec.ts`
- [ ] USR-024 [P] [US1] Escribir primero pruebas PostgreSQL de índice único `emailNormalized`, `registrationId` único y dos creaciones concurrentes con correos equivalentes, exigiendo una sola identidad (Component: Registration concurrency; Trace: FR-004, FR-006; Depends on: USR-020) in `apps/users-service/test/integration/registration-concurrency.spec.ts`
- [ ] USR-025 [P] [US1] Escribir primero pruebas integration de replays create/activate/cancel, transiciones válidas y consultas que excluyen PENDING/CANCELLED (Component: Registration state; Trace: FR-005–FR-006; Depends on: USR-020) in `apps/users-service/test/integration/registration-state.spec.ts`
- [ ] USR-026 [P] [US1] Escribir primero pruebas de seguridad para service JWT ausente, expirado, firma/issuer/audience/scope incorrectos, verificando 401/403 y cero llamadas al repositorio (Component: Registration service auth; Trace: Constitution V; Depends on: USR-014) in `apps/users-service/test/security/service-auth.spec.ts`

#### Implementation for User Story 1

- [ ] USR-027 [US1] Definir modelo Prisma `User` con `id UUID PK immutable`, `name varchar(100) required`, `email varchar(254) required`, `emailNormalized varchar(254) unique`, `role GUEST|OWNER|ADMIN`, `status PENDING|ACTIVE|CANCELLED`, `phone varchar(16) nullable`, `preferences jsonb nullable`, `version integer default 1`, `registrationId UUID unique` y timestamps (Component: User persistence model; Trace: FR-001–FR-006; Depends on: USR-023) in `apps/users-service/prisma/schema.prisma`
- [ ] USR-028 [US1] Crear migración inicial de User con constraints de UUID, nombre 2–100, correo 254, rol/estado, versión positiva e índices únicos, sin FK hacia otra base (Component: User migration; Trace: FR-001–FR-006, Constitution III; Depends on: USR-027) in `apps/users-service/prisma/migrations/*_create_users/migration.sql`
- [ ] USR-029 [P] [US1] Implementar value objects/policies `UserId`, `RegistrationId`, `Name`, `Email`, `Role` y `RegistrationStatus` con reglas exactas de USR-023 (Component: Registration domain values; Trace: FR-001–FR-004; Depends on: USR-023) in `apps/users-service/src/domain/users/`
- [ ] USR-030 [US1] Implementar entidad/agregado User y transiciones idempotentes PENDING→ACTIVE o PENDING→CANCELLED, prohibiendo reactivar CANCELLED o cambiar rol desde este flujo (Component: User aggregate; Trace: FR-002, FR-005–FR-006; Depends on: USR-029) in `apps/users-service/src/domain/users/user.entity.ts` and `apps/users-service/src/domain/users/registration.policy.ts`
- [ ] USR-031 [US1] Implementar repositorio Prisma de create/find/activate/cancel por `registrationId` con transacciones locales, traducción de unique conflict y exclusión de estados no ACTIVE en proyecciones públicas (Component: Registration repository; Trace: FR-004–FR-006; Depends on: USR-016–USR-017, USR-028, USR-030) in `apps/users-service/src/infrastructure/persistence/prisma/user.repository.ts`
- [ ] USR-032 [US1] Implementar casos de uso `CreatePendingUser`, `ActivatePendingUser` y `CancelPendingUser` idempotentes, aceptando UUID asignado externamente y nunca contraseña/hash (Component: Registration use cases; Trace: RQ-02, FR-001–FR-006; Depends on: USR-031) in `apps/users-service/src/application/registration/`
- [ ] USR-033 [US1] Implementar DTOs cerrados para create/activate/cancel con UUIDs canónicos, nombre/correo/rol válidos y rechazo explícito de `ADMIN`, password o campos desconocidos (Component: Registration DTOs; Trace: FR-001–FR-003, BR-006; Depends on: USR-012, USR-029) in `apps/users-service/src/interfaces/http/internal/registration.dto.ts`
- [ ] USR-034 [US1] Exponer POST `/internal/v1/registrations`, POST `/internal/v1/registrations/{registrationId}/activate` y POST `/internal/v1/registrations/{registrationId}/cancel`, protegidos por service JWT/scopes y delegando toda política a casos de uso (Component: Registration controllers; Trace: RQ-02, FR-001–FR-006; Depends on: USR-014, USR-032–USR-033) in `apps/users-service/src/interfaces/http/internal/registration.controller.ts` and `apps/users-service/src/modules/registration-state.module.ts`
- [ ] USR-035 [US1] Mapear validación a 400, registro inexistente a 404 y conflictos de email/estado/idempotencia a códigos 409 seguros sin revelar identidad existente (Component: Registration errors; Trace: FR-004–FR-006, FR-024; Depends on: USR-017, USR-031–USR-034) in `apps/users-service/src/interfaces/http/internal/registration-error.mapper.ts`
- [ ] USR-036 [US1] Generar Swagger de registro interno y comparar operaciones, schemas, service JWT y errores con `openapi-users-service.yaml` (Component: Registration OpenAPI; Trace: RQ-02, Constitution VII; Depends on: USR-034–USR-035) in `apps/users-service/src/interfaces/openapi/registration.openapi.ts` and `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml`
- [ ] USR-037 [US1] Ejecutar y dejar verdes suites unit/integration/contract/security de US1 con trazabilidad RQ-02/FR-001–FR-006, sin declarar completa la saga externa (Component: US1 checkpoint; Trace: SC-002, SC-007; Depends on: USR-022–USR-036) in `apps/users-service/test/` and `specs/001-fundamentos-identidad/validation-report.md`

**Checkpoint**: Users demuestra su parte de RQ-02 de forma independiente; coordinación y
credenciales reales permanecen como dependencia de G3.

---

### Phase 4: User Story 2 — Resolver identidad para login (Priority: P1)

**Goal**: Entregar a Auth únicamente la identidad ACTIVE correspondiente al correo vigente, sin
implementar login, contraseña, JWT, sesiones ni refresh.

**Independent Test**: Con service JWT válido, un correo equivalente de usuario ACTIVE retorna
solo `userId,role,status`; correo ausente o estado no activo no expone perfil ni secretos.

#### Tests for User Story 2

- [ ] USR-038 [P] [US2] Escribir primero prueba de contrato para POST `/internal/v1/login-identities/resolve` con service JWT, email máximo 254 y respuesta mínima `userId,role,status=ACTIVE` (Component: Login lookup contract; Trace: FR-007–FR-009; Depends on: USR-004, USR-014, USR-019) in `apps/users-service/test/contract/login-identity.contract.spec.ts`
- [ ] USR-039 [P] [US2] Escribir primero pruebas unitarias de lookup por correo normalizado que excluya PENDING/CANCELLED y nunca retorne nombre, correo, teléfono, preferencias o foto (Component: Login lookup policy; Trace: FR-007–FR-009, FR-024; Depends on: USR-023, USR-030) in `apps/users-service/test/unit/login-identity-policy.spec.ts`
- [ ] USR-040 [P] [US2] Escribir primero pruebas PostgreSQL para correo vigente, correo anterior tras actualización y estados no ACTIVE, verificando índice/consulta por `emailNormalized` (Component: Login lookup persistence; Trace: FR-004, FR-007, FR-017; Depends on: USR-028, USR-031) in `apps/users-service/test/integration/login-identity.spec.ts`

#### Implementation for User Story 2

- [ ] USR-041 [US2] Añadir proyección Prisma mínima y método repository `findActiveLoginIdentityByNormalizedEmail` sin datos de perfil adicionales (Component: Login lookup repository; Trace: FR-007–FR-009, FR-024; Depends on: USR-039–USR-040) in `apps/users-service/src/infrastructure/persistence/prisma/login-identity.repository.ts`
- [ ] USR-042 [US2] Implementar `ResolveLoginIdentity` normalizando correo y retornando únicamente `userId`, rol y ACTIVE, con resultado indistinguible para ausente/no activo hacia el consumidor autorizado (Component: Login lookup use case; Trace: FR-007–FR-009; Depends on: USR-041) in `apps/users-service/src/application/login/resolve-login-identity.use-case.ts`
- [ ] USR-043 [US2] Exponer controlador/DTO interno de lookup protegido por scope service JWT de Auth, sin aceptar password ni datos de sesión (Component: Login lookup controller; Trace: FR-007–FR-009, Constitution V; Depends on: USR-014, USR-038, USR-042) in `apps/users-service/src/interfaces/http/internal/login-identity.controller.ts` and `apps/users-service/src/interfaces/http/internal/login-identity.dto.ts`
- [ ] USR-044 [US2] Generar/validar Swagger del lookup y dejar verdes sus suites, registrando que la autenticación final depende externamente de G3 (Component: US2 checkpoint; Trace: FR-007–FR-009, SC-007; Depends on: USR-038–USR-043) in `apps/users-service/src/interfaces/openapi/login-identity.openapi.ts`, `apps/users-service/test/` and `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml`

**Checkpoint**: Users resuelve identidad ACTIVE; no autentica credenciales ni crea sesiones.

---

### Phase 5: User Story 3 — Consultar y editar el perfil propio (Priority: P2) — RQ-01

**Goal**: Consultar y actualizar atómicamente el perfil/foto del usuario autenticado con todas
las validaciones, null semantics, unicidad y control optimista.

**Independent Test**: Un bearer válido consulta y actualiza su perfil; entradas inválidas,
correo duplicado, versión obsoleta o foto inválida no aplican cambios parciales.

#### Tests for User Story 3

- [ ] USR-045 [P] [US3] Escribir primero pruebas de contrato GET/PATCH `/internal/v1/users/{userId}/profile` y GET `/internal/v1/users/{userId}/profile/photo` con bearer, multipart, 200/400/401/403/404/409/413/415 y Problem Details (Component: Profile contract; Trace: RQ-01, FR-014–FR-019, FR-023; Depends on: USR-004, USR-015, USR-019) in `apps/users-service/test/contract/profile.contract.spec.ts`
- [ ] USR-046 [P] [US3] Escribir primero pruebas unitarias: nombre 2–100 tras trim, correo válido máximo 254, teléfono E.164, máximo 20 preferencias escalares, omitido conserva, null elimina opcionales y nombre/correo null se rechazan (Component: Profile validation; Trace: FR-015–FR-016, FR-019; Depends on: USR-004) in `apps/users-service/test/unit/profile-validation.spec.ts`
- [ ] USR-047 [P] [US3] Escribir primero pruebas PostgreSQL de update `id+expectedVersion`, incremento de versión, email normalizado único, correo anterior/nuevo y rollback integral ante conflicto (Component: Profile atomicity; Trace: FR-017–FR-018, FR-023; Depends on: USR-020, USR-028) in `apps/users-service/test/integration/profile-update.spec.ts`
- [ ] USR-048 [P] [US3] Escribir primero pruebas de foto JPEG/PNG por magic bytes, límite exacto 5.000.000 bytes, digest/ETag, eliminación null, archivo+`photo:null` inválido y rollback (Component: Profile photo; Trace: FR-015–FR-016, FR-018–FR-019, FR-023; Depends on: USR-020) in `apps/users-service/test/integration/profile-photo.spec.ts`

#### Models and migrations for User Story 3

- [ ] USR-049 [US3] Actualizar `ProfilePhoto` a `userId UUID PK/FK local`, `content BYTEA max 5.000.000`, `mediaType image/jpeg|image/png`, `byteSize 1..5.000.000`, `sha256 char(64)` y `updatedAt`; conservar User.version desde 1 (Component: Profile persistence model; Trace: FR-014–FR-018; Depends on: USR-046–USR-048) in `apps/users-service/prisma/schema.prisma`
- [ ] USR-050 [US3] Crear migración de foto con checks de tamaño máximo 5.000.000 bytes, media type, FK local e índices de versión/email (Component: Profile migration; Trace: FR-016–FR-018; Depends on: USR-049) in `apps/users-service/prisma/migrations/*_add_profile_photo/migration.sql`

#### Implementation for User Story 3

- [ ] USR-051 [P] [US3] Implementar value objects/validators de nombre, correo, teléfono, preferencias, patch y expectedVersion con reglas exactas de USR-046 (Component: Profile domain values; Trace: FR-015–FR-019; Depends on: USR-046) in `apps/users-service/src/domain/profiles/`
- [ ] USR-052 [P] [US3] Implementar validación de magic bytes, tamaño 5.000.000, SHA-256/ETag y streaming binario seguro sin conservar filename (Component: Photo domain/service; Trace: FR-015–FR-016, FR-024; Depends on: USR-048) in `apps/users-service/src/domain/photos/` and `apps/users-service/src/infrastructure/files/profile-photo.service.ts`
- [ ] USR-053 [US3] Implementar repositorio transaccional que actualice campos/foto con `id+expectedVersion`, incremente versión solo en éxito y distinga conflicto email/versión sin cambio parcial (Component: Profile repository; Trace: FR-017–FR-018, FR-023; Depends on: USR-016–USR-017, USR-050–USR-052) in `apps/users-service/src/infrastructure/persistence/prisma/profile.repository.ts`
- [ ] USR-054 [US3] Implementar casos de uso `GetOwnProfile`, `UpdateOwnProfile` y `GetOwnProfilePhoto` con proyecciones saneadas y sin credencial/sesión (Component: Profile use cases; Trace: RQ-01, FR-014–FR-019, FR-023–FR-024; Depends on: USR-053) in `apps/users-service/src/application/profiles/`
- [ ] USR-055 [US3] Implementar DTO cerrado `ProfilePatch` con `expectedVersion` obligatorio, campos permitidos/null semantics y rechazo de rol, userId, status, credential, version override y desconocidos (Component: Profile DTOs; Trace: FR-015–FR-016, FR-019, FR-022; Depends on: USR-012, USR-046, USR-051) in `apps/users-service/src/interfaces/http/profiles/update-profile.dto.ts`
- [ ] USR-056 [US3] Implementar parser multipart de parte JSON `profile` y archivo opcional, rechazando archivo+`photo:null`, payload vacío, tipo inválido y límites antes del caso de uso (Component: Profile multipart adapter; Trace: FR-015–FR-016, FR-019; Depends on: USR-048, USR-052, USR-055) in `apps/users-service/src/interfaces/http/profiles/profile-multipart.interceptor.ts`
- [ ] USR-057 [US3] Exponer GET/PATCH `/internal/v1/users/{userId}/profile` y GET `/internal/v1/users/{userId}/profile/photo`, protegidos por bearer, delegando ownership a guard y dominio a casos de uso; servir foto binaria sin base64 (Component: Profile controllers; Trace: RQ-01, FR-014–FR-019; Depends on: USR-015, USR-054–USR-056) in `apps/users-service/src/interfaces/http/profiles/profile.controller.ts` and `apps/users-service/src/modules/profiles.module.ts`
- [ ] USR-058 [US3] Mapear validación a 400, ausencia propia a 404, email/versión a códigos 409 distintos, tamaño a 413 y media type a 415 sin filtrar estado interno (Component: Profile errors; Trace: FR-016–FR-019, FR-023–FR-024; Depends on: USR-017, USR-053–USR-057) in `apps/users-service/src/interfaces/http/profiles/profile-error.mapper.ts`
- [ ] USR-059 [US3] Generar Swagger de perfil/foto con bearer, multipart, null, 5.000.000 bytes, streaming y errores, comparándolo con `openapi-users-service.yaml` (Component: Profile OpenAPI; Trace: RQ-01, Constitution VII; Depends on: USR-057–USR-058) in `apps/users-service/src/interfaces/openapi/profile.openapi.ts` and `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml`
- [ ] USR-060 [US3] Ejecutar y dejar verdes suites unit/integration/contract de US3, incluyendo cambio inmediato de correo y rollback, sin declarar completa la integración Gateway (Component: US3 checkpoint; Trace: RQ-01, SC-002–SC-003, SC-007; Depends on: USR-045–USR-059) in `apps/users-service/test/` and `specs/001-fundamentos-identidad/validation-report.md`

**Checkpoint**: RQ-01 funciona directamente en Users con bearer sintético; routing público y
sesión real permanecen como dependencias externas.

---

### Phase 6: User Story 4 — Restringir modificaciones no autorizadas (Priority: P2)

**Goal**: Rechazar tokens inválidos, acceso cross-user y mass assignment antes de leer o mutar
el recurso objetivo.

**Independent Test**: Dos identidades y un fixture ADMIN demuestran que solo el propietario
puede consultar/editar su perfil y que todo rechazo deja la base intacta.

#### Tests for User Story 4

- [ ] USR-061 [P] [US4] Escribir primero pruebas JWT directas para unsigned/`alg:none`, confusión HS256, clave/issuer/audience incorrectos, expiración y `sub`/`sid` ausentes o UUID no canónicos, exigiendo 401 y cero repositorio (Component: Users JWT hardening; Trace: FR-011–FR-013; Depends on: USR-004, USR-015) in `apps/users-service/test/security/jwt-hardening.spec.ts`
- [ ] USR-062 [P] [US4] Escribir primero pruebas unitarias de ownership para mismatch, ADMIN sin privilegio cross-user y precedencia autenticación→autorización (Component: Profile ownership; Trace: FR-020–FR-021, BR-004; Depends on: USR-004, USR-015) in `apps/users-service/test/unit/profile-authorization.spec.ts`
- [ ] USR-063 [P] [US4] Escribir primero pruebas integration donde IDs ajenos existentes/inexistentes producen el mismo 403 antes de lookup y cero lecturas/mutaciones (Component: Ownership non-disclosure; Trace: FR-020–FR-021, FR-024; Depends on: USR-020, USR-057) in `apps/users-service/test/integration/profile-ownership.spec.ts`
- [ ] USR-064 [P] [US4] Escribir primero pruebas mass-assignment para role, id, status, registrationId, credential, version override y desconocidos, exigiendo 400 y rollback completo (Component: Restricted fields; Trace: FR-019, FR-022–FR-023, BR-003/BR-005; Depends on: USR-020, USR-055–USR-057) in `apps/users-service/test/integration/profile-restricted-fields.spec.ts`

#### Implementation for User Story 4

- [ ] USR-065 [US4] Endurecer estrategia JWT para satisfacer USR-061 con allowlist RS256, claims canónicos y autenticación antes de repositorio (Component: JWT authorization boundary; Trace: FR-011–FR-013; Depends on: USR-061, USR-015) in `apps/users-service/src/interfaces/http/auth/jwt.strategy.ts`
- [ ] USR-066 [US4] Implementar ownership guard `principal.sub == route.userId` antes del caso de uso, devolviendo 403 uniforme para toda identidad ajena incluido ADMIN (Component: Ownership guard; Trace: FR-020–FR-021; Depends on: USR-062–USR-063, USR-065) in `apps/users-service/src/interfaces/http/guards/profile-ownership.guard.ts`
- [ ] USR-067 [P] [US4] Implementar metadata/guard de roles reutilizable y probar roles mediante metadata de test sin crear endpoint productivo ni permisos no especificados (Component: Roles guard; Trace: FR-002, FR-013, BR-001; Depends on: USR-062, USR-065) in `apps/users-service/src/interfaces/http/guards/roles.guard.ts` and `apps/users-service/src/interfaces/http/guards/roles.decorator.ts`
- [ ] USR-068 [US4] Endurecer DTO/parser para rechazar todo campo restringido/desconocido antes del dominio y sin mutación parcial (Component: Mass-assignment protection; Trace: FR-019, FR-022–FR-023; Depends on: USR-064, USR-055–USR-056) in `apps/users-service/src/interfaces/http/profiles/update-profile.dto.ts` and `apps/users-service/src/interfaces/http/profiles/profile-multipart.interceptor.ts`
- [ ] USR-069 [US4] Actualizar controladores/Swagger con orden 401→403→validación, sin existencia diferenciable ni privilegios ADMIN ajenos (Component: Authorization HTTP/OpenAPI; Trace: FR-011–FR-013, FR-019–FR-024, Constitution VII; Depends on: USR-065–USR-068) in `apps/users-service/src/interfaces/http/profiles/profile.controller.ts`, `apps/users-service/src/interfaces/openapi/profile.openapi.ts` and `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml`
- [ ] USR-070 [US4] Ejecutar y dejar verdes suites security/unit/integration/contract de US4 y registrar FR-020–FR-024/SC-004 (Component: US4 checkpoint; Trace: SC-003–SC-004, SC-007; Depends on: USR-061–USR-069) in `apps/users-service/test/` and `specs/001-fundamentos-identidad/validation-report.md`

**Checkpoint**: Users aplica autenticación y ownership en defensa en profundidad sin depender de
que el borde sea confiable.

---

### Phase 7: Integración externa y cierre del Grupo 2

**Purpose**: Verificar los contratos con consumidores reales. Estas tareas permanecen al final
porque requieren entregables de G1 o G3.

- [ ] USR-071 Integrar Auth→Users para create/activate/cancel de registro, verificando service JWT/scopes, UUID estable, idempotencia, concurrencia, timeout/retry externo y PENDING nunca autenticable (Component: Auth↔Users registration integration; Trace: RQ-02, FR-001–FR-006; Depends on: USR-037; External dependency: G3 entrega cliente/orquestador, service JWT y contrato Auth compatibles) in `apps/users-service/test/integration/auth-registration-consumer.spec.ts`
  - Parte Auth↔Users acreditada con Auth real: service JWT/scopes (INT-16), UUID estable, idempotencia y concurrencia (INT-02–05), retry ante respuesta perdida (INT-14) y PENDING nunca autenticable (INT-07, INT-13). La evidencia está en `apps/auth-service/test/integration/cross-service-*.spec.ts`. Sigue abierta porque el timeout literal no se ejecutó contra Users real. Evidencia 2026-09-30: `npm run test:auth-users` y `agents/integracion/resultado.md`.
- [X] USR-072 Integrar Auth→Users para lookup de identidad ACTIVE, verificando correo vigente, exclusión de estados no activos, respuesta mínima y fallos seguros (Component: Auth↔Users login lookup; Trace: FR-007–FR-009, FR-017; Depends on: USR-044, USR-060; External dependency: G3 entrega consumidor lookup y comportamiento de login genérico) in `apps/users-service/test/integration/auth-login-consumer.spec.ts`
  - Acreditada con Auth real sin Gateway. La evidencia está en `apps/auth-service/test/contract/users-login-identity.consumer.spec.ts`, `cross-service-login.spec.ts` y `cross-service-profile.spec.ts` (INT-06–08, INT-10 correo vigente tras el cambio, INT-13 fallo seguro), no en la ruta indicada arriba. Evidencia 2026-09-30: `npm run test:auth-users` y `agents/integracion/resultado.md`.
- [ ] USR-073 Integrar Gateway→Users para GET/PATCH/foto, verificando bearer reenviado, `traceId`, multipart/streaming, 401/403/404/409/413/415 y readiness/timeout (Component: Gateway↔Users profile integration; Trace: RQ-01, FR-011–FR-024; Depends on: USR-060, USR-070; External dependency: G1 entrega rutas, introspección previa, stripping de headers y contrato público compatibles) in `apps/users-service/test/integration/gateway-profile-consumer.spec.ts`
  - Sigue abierta (requiere Gateway). Parte Auth↔Users acreditada: GET/PATCH multipart del perfil con el access JWT de un login real de Auth, `expectedVersion` y 409, ownership 403 y JWT inválido o de servicio 401 (INT-09–11). No cubre la foto vía Gateway, la introspección previa, el stripping de headers ni el streaming en el borde. Evidencia 2026-09-30: `npm run test:auth-users`.
- [ ] USR-074 [P] Ejecutar pruebas provider/consumer de `openapi-users-service.yaml` con G1/G3 y cerrar drift únicamente en el contrato propiedad de G2 (Component: Users contract integration; Trace: Constitution VII, SC-007; Depends on: USR-036, USR-044, USR-059, USR-069; External dependency: G1/G3 aportan expectativas de consumidor aprobadas) in `apps/users-service/test/contract/users-provider.contract.spec.ts` and `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml`
- [ ] USR-075 Finalizar `users-service`, `users-db` y `users-migrate` en Compose con migración previa, red interna, puerto 3002 no publicado, healthchecks, secretos, volumen y restart explícito (Component: Users runtime integration; Trace: Plan §7, Constitution III; Depends on: USR-008, USR-018, USR-071–USR-073; External dependency: G1 integra nombres de red/readiness en Compose raíz) in `docker-compose.yml` and `infra/docker/users/`
- [ ] USR-076 [P] Automatizar lint/drift de OpenAPI Users y verificar que respuestas/logs no contienen credenciales, JWT, service JWT, correo, foto ni PII innecesaria (Component: Users contract/security CI; Trace: FR-024, Constitution V/VII; Depends on: USR-013, USR-074) in `scripts/validate-users-openapi.mjs`, `apps/users-service/test/security/secret-leakage.spec.ts` and `.github/workflows/ci.yml`
- [ ] USR-077 [P] Participar en E2E HTTPS del flujo registro→login→perfil→cambio de correo aportando fixtures Users y corrigiendo solo fallos dentro de Users (Component: Cross-service E2E participation; Trace: RQ-01, RQ-02, SC-002–SC-004; Depends on: USR-071–USR-073; External dependency: G1 ejecuta E2E y G3 entrega Auth operativo) in `apps/users-service/test/e2e/users-evidence.spec.ts` and `specs/001-fundamentos-identidad/validation-report.md`
  - Sigue abierta (requiere E2E HTTPS de Gateway). El recorrido registro→login→perfil→cambio de correo ya pasa directamente contra Auth y Users reales, sin HTTPS de borde (INT-01, INT-06, INT-09, INT-10). Evidencia 2026-09-30: `npm run test:auth-users`.
- [ ] USR-078 Ejecutar CI/Compose final de Users, acreditar cobertura afectada ≥70%, migraciones, contratos, seguridad, concurrencia y revisión independiente, registrando bloqueos externos sin marcarlos completos (Component: Users Definition of Done; Trace: Constitution VIII/quality gates, SC-007; Depends on: USR-071–USR-077; External dependency: resultados coordinados de G1/G3 para integraciones) in `.github/workflows/ci.yml` and `specs/001-fundamentos-identidad/validation-report.md`

**Final checkpoint**: El Grupo 2 entrega Users y `users_db` ejecutables y probados. Ninguna tarea
implementa routing público, credenciales, login, emisión JWT, sesiones o refresh tokens.

---

### Dependencies and Execution Order

#### Phase dependencies

```text
Phase 1 Users Setup
    ↓
Phase 2 Users Foundation
    ↓
US1 Registration identity / RQ-02
    ├── US2 Login identity lookup
    └── US3 Profile / RQ-01
            ↓
        US4 Authorization hardening
            ↓
Phase 7 External integration with G1/G3
```

- US1 define User, roles, estados y correo normalizado; bloquea lookup y persistencia de perfil.
- US2 puede avanzar tras US1 usando service JWT sintético, sin esperar Auth real.
- US3 puede avanzar tras el modelo/migración US1 usando bearer sintético, sin esperar Gateway.
- US4 depende de controladores/perfil de US3 y de Passport fundacional.
- USR-071–USR-074 son los primeros puntos que requieren contratos/servicios reales externos.

#### Parallel plan for two people

1. Ambos completan USR-001/USR-002 y acuerdan ownership de archivos.
2. Persona A trabaja Prisma/config/persistencia (`USR-006`, `USR-010`–`USR-011`, `USR-016`,
   `USR-020`); Persona B trabaja HTTP/security/observabilidad/OpenAPI (`USR-012`–`USR-015`,
   `USR-017`–`USR-019`).
3. En US1, una persona desarrolla dominio/repositorio y la otra contratos/controladores; se unen
   en el checkpoint.
4. Después de US1, una persona ejecuta US2 mientras la otra inicia validadores/pruebas de US3;
   ambas completan US3/US4 y se reparten Auth↔Users y Gateway↔Users en Phase 7.

### Implementation Strategy

#### Suggested MVP

El MVP del Grupo 2 es Phase 1 + Phase 2 + US1 hasta USR-037: demuestra creación/activación/
cancelación idempotente de identidad mediante el contrato interno, sin afirmar que la saga Auth
esté integrada.

#### Incremental delivery

1. Setup y Foundation.
2. US1 identidad de registro y roles.
3. US2 lookup mínimo para Auth.
4. US3 perfil/foto y cambio de correo.
5. US4 autorización adversarial.
6. Integraciones externas y Definition of Done.

### Notes

- No editar aplicaciones, bases, migraciones ni contenedores de G1/G3 desde estas tareas.
- No almacenar contraseñas, hashes de contraseña, sesiones o refresh tokens en `users_db`.
- No implementar login ni emitir/renovar access JWT dentro de Users.
- El límite autorizado de foto es exactamente 5.000.000 bytes en modelo, contratos y pruebas.
- Todo cambio de contrato Users requiere revisión de sus consumidores antes de integrarse.
- `[P]` no elimina dependencias explícitas ni permite cambios simultáneos sobre el mismo archivo.

---

## Grupo 3 — auth-service

**Fuente**: `specs/001-fundamentos-identidad/tasks/tasks_authService.md`

**Input**: `plan.md`, `spec.md`, la constitución, `tendencias.md`, `data-model.md`,
`contracts/openapi-auth-service.yaml` y el estado greenfield del repositorio.

**Scope**: Este backlog pertenece exclusivamente al Grupo 3. Implementa `auth-service`,
`auth_db`, sus migraciones, seguridad, contenedor, contrato interno y pruebas. Los otros grupos
aparecen únicamente como dependencias contractuales externas en la fase final.

**Public/internal mapping**: Auth implementa los handlers internos que respaldan
`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` y `GET /auth/validate`. La
publicación de esas rutas pertenece al Grupo 1; el contrato propio de Auth conserva
`POST /internal/v1/registrations`, `POST /internal/v1/login`,
`POST /internal/v1/sessions/refresh` y `POST /internal/v1/sessions/validate`.

**Tests**: Son obligatorias por solicitud del usuario y por los Principios V, VII y VIII de la
constitución. Dentro de cada historia se escriben primero y deben fallar por la conducta ausente.

**Format**: `- [ ] AUTH-### [P?] [US?] descripción (Component; Trace; Depends on) in path`

- `[P]` indica ejecución paralela únicamente después de completar sus dependencias declaradas.
- `[US1]` y `[US2]` enlazan la tarea con las historias de registro y sesión del `spec.md`.
- `External dependency` identifica un contrato entregado por G1 o G2; no autoriza cambios en
  aplicaciones ajenas a Auth.

### Phase 1: Setup de `auth-service`

**Purpose**: Crear exclusivamente el workspace, toolchain y contenedores base de Auth.

- [X] AUTH-001 Registrar `apps/auth-service` como workspace NestJS 10/Node 20 con scripts de build, lint, typecheck, Prisma y test sin crear paquetes de otros servicios (Component: Auth workspace; Trace: Plan §1/§5, Constitution VI; Depends on: none) in `package.json`, `package-lock.json` and `nest-cli.json`
- [X] AUTH-002 Crear bootstrap y estructura vacía `domain`, `application`, `infrastructure`, `interfaces` y `modules` para Auth en puerto interno 3001 (Component: Auth structure; Trace: Plan §2/§5; Depends on: AUTH-001) in `apps/auth-service/src/main.ts`, `apps/auth-service/src/app.module.ts` and `apps/auth-service/src/{domain,application,infrastructure,interfaces,modules}/`
- [X] AUTH-003 [P] Configurar TypeScript estricto, aliases por capa y build independiente sin importar NestJS/Prisma desde dominio (Component: Auth toolchain; Trace: Constitution II/VI; Depends on: AUTH-001) in `apps/auth-service/tsconfig.json`, `apps/auth-service/tsconfig.build.json` and `tsconfig.base.json`
- [X] AUTH-004 [P] Configurar Jest/Supertest y proyectos unit/integration/contract/security con umbral de cobertura afectada ≥70% (Component: Auth test harness; Trace: Constitution VIII; Depends on: AUTH-001) in `apps/auth-service/jest.config.ts` and `apps/auth-service/test/{unit,integration,contract,security}/setup.ts`
- [X] AUTH-005 [P] Documentar variables exclusivas de Auth: puerto 3001, `auth_db`, Redis, Argon2id, RS256, issuer/audience, service-auth, sesión, reconciliador y OTLP sin secretos reales (Component: Auth configuration; Trace: Plan §5/§7, Constitution V; Depends on: AUTH-001) in `.env.example` and `apps/auth-service/README.md`
- [X] AUTH-006 [P] Configurar Prisma 6.x únicamente para PostgreSQL 16, cliente local y comandos `generate`, `migrate dev` y `migrate deploy`, prohibiendo `db push` en runtime (Component: Auth ORM; Trace: Plan §2/§5, Constitution III; Depends on: AUTH-001) in `apps/auth-service/prisma/schema.prisma` and `apps/auth-service/package.json`
- [X] AUTH-007 [P] Crear Dockerfile multi-stage Node 20 con `npm ci`, generación Prisma, build del workspace, usuario no root y healthcheck compatible (Component: Auth Docker image; Trace: Plan §7; Depends on: AUTH-001, AUTH-006) in `infra/docker/auth/Dockerfile` and `infra/docker/auth/.dockerignore`
- [X] AUTH-008 Integrar únicamente `auth-service`, `auth-db`, `auth-migrate` y el namespace Redis de Auth con volumen/credenciales propios, red interna, readiness y `restart: always` para Auth (Component: Auth Compose; Trace: Plan §5/§7, Constitution III; Depends on: AUTH-002, AUTH-005–AUTH-007) in `docker-compose.yml`
- [X] AUTH-009 [P] Añadir etapas CI exclusivas de Auth para instalación bloqueada, Prisma generate/migrate, lint, tipos, tests, cobertura, OpenAPI y build de imagen (Component: Auth CI; Trace: Constitution VII–VIII; Depends on: AUTH-001, AUTH-004, AUTH-006–AUTH-007) in `.github/workflows/ci.yml`

**Checkpoint**: El workspace Auth compila, Prisma genera cliente, la imagen se construye y el
harness de pruebas arranca sin requerir implementaciones de otros grupos.

---

### Phase 2: Fundamentos bloqueantes de `auth-service`

**Purpose**: Establecer configuración, persistencia, criptografía, seguridad entre servicios,
errores, observabilidad y documentación reutilizables.

**Critical**: Ninguna historia comienza hasta completar esta fase.

- [X] AUTH-010 Implementar configuración tipada y validada con fallo de arranque si faltan URL/credenciales de `auth_db` o Redis, puerto, parámetros Argon2id, claves RS256 con `kid`, issuer/audience, service-auth, sesión, reconciliador u OTLP (Component: Auth config; Trace: Plan §5, Constitution V; Depends on: AUTH-002, AUTH-005) in `apps/auth-service/src/infrastructure/config/auth-config.ts` and `apps/auth-service/src/infrastructure/config/config.module.ts`
- [X] AUTH-011 Implementar `PrismaModule` y adaptador de conexión exclusivamente a `auth_db`, con lifecycle y transacciones locales, sin acceso a bases ajenas (Component: Auth persistence; Trace: Constitution II–III; Depends on: AUTH-006, AUTH-010) in `apps/auth-service/src/infrastructure/persistence/prisma/prisma.service.ts` and `apps/auth-service/src/infrastructure/persistence/prisma/prisma.module.ts`
- [X] AUTH-012 [P] Implementar `ValidationPipe` con whitelist/rechazo de campos desconocidos y Problem Details `type,title,status,detail,instance,code,traceId,errors[]` sin datos sensibles (Component: Auth HTTP validation/errors; Trace: FR-003, FR-008, FR-024, Constitution V; Depends on: AUTH-002) in `apps/auth-service/src/interfaces/http/validation.pipe.ts`, `apps/auth-service/src/interfaces/http/problem.filter.ts` and `apps/auth-service/src/interfaces/http/problem.mapper.ts`
- [X] AUTH-013 [P] Implementar `traceId`, logs JSON/OTLP y redacción de contraseñas, hashes, JWT, refresh tokens, service JWT y correos (Component: Auth observability; Trace: FR-024, Constitution V; Depends on: AUTH-002) in `apps/auth-service/src/infrastructure/observability/otel.ts`, `apps/auth-service/src/infrastructure/observability/auth-logger.ts` and `apps/auth-service/src/interfaces/http/trace.interceptor.ts`
- [X] AUTH-014 [P] Implementar guard receptor de service JWT para llamadas G1→Auth con algoritmo, firma, issuer, audience, scope y expiración estrictos (Component: Auth inbound service authentication; Trace: Plan §6, Constitution V; Depends on: AUTH-010) in `apps/auth-service/src/interfaces/http/guards/service-auth.guard.ts` and `apps/auth-service/src/infrastructure/security/service-jwt.verifier.ts`
- [X] AUTH-015 [P] Implementar emisor de service JWT para llamadas G3→Users con clave, issuer, audience, scope y TTL distintos de los JWT de usuario (Component: Auth outbound service authentication; Trace: Plan §6, Constitution V; Depends on: AUTH-010) in `apps/auth-service/src/infrastructure/security/users-service-token.provider.ts`
- [X] AUTH-016 [P] Definir puertos de repositorios, reloj, generador UUID/entropía, hasher, firmante JWT, caché y cliente Users sin tipos de framework en dominio/aplicación (Component: Auth application ports; Trace: Constitution II/VI; Depends on: AUTH-002) in `apps/auth-service/src/application/ports/`
- [X] AUTH-017 [P] Definir errores de dominio/aplicación para validación, credenciales, idempotencia, sesión, refresh, dependencia y límite de intentos, dejando su mapeo HTTP fuera del dominio (Component: Auth errors; Trace: FR-003, FR-005–FR-013; Depends on: AUTH-002) in `apps/auth-service/src/domain/shared/domain-error.ts` and `apps/auth-service/src/application/errors/auth-errors.ts`
- [X] AUTH-018 [P] Implementar adaptador Argon2id parametrizado y verificación de coste equivalente con hash señuelo para cuentas inexistentes (Component: Credential cryptography; Trace: FR-007–FR-008, Plan §5; Depends on: AUTH-010, AUTH-016) in `apps/auth-service/src/infrastructure/security/argon2-password-hasher.ts`
- [X] AUTH-019 [P] Implementar firmante/verificador RS256 con allowlist de algoritmo, selección por `kid`, issuer/audience fijos y reloj inyectable (Component: JWT cryptography; Trace: FR-009–FR-013; Depends on: AUTH-010, AUTH-016) in `apps/auth-service/src/infrastructure/security/rs256-token.service.ts`
- [X] AUTH-020 [P] Implementar cliente Redis con namespaces separados para límite de login y caché de sesión, métricas y políticas explícitas de fallo (Component: Auth cache; Trace: Plan §5/§7; Depends on: AUTH-010, AUTH-016) in `apps/auth-service/src/infrastructure/cache/auth-redis.module.ts` and `apps/auth-service/src/infrastructure/cache/auth-cache.adapter.ts`
- [X] AUTH-021 [P] Implementar cliente REST tipado hacia Users con service JWT, `traceId`, timeout, circuit breaker y reintento solo para operaciones idempotentes (Component: Users client adapter; Trace: Plan §6, Constitution IV; Depends on: AUTH-015–AUTH-016) in `apps/auth-service/src/infrastructure/http/users-service.client.ts` and `apps/auth-service/src/infrastructure/http/users-service.types.ts`
- [X] AUTH-022 [P] Implementar `/health/live` y `/health/ready`, donde readiness exige configuración válida, migración aplicada, `auth_db` disponible y Redis disponible para los flujos que fallan cerrado (Component: Auth health; Trace: Plan §7; Depends on: AUTH-010–AUTH-011, AUTH-020) in `apps/auth-service/src/modules/health/health.controller.ts` and `apps/auth-service/src/modules/health/health.module.ts`
- [X] AUTH-023 [P] Inicializar Swagger interno para `http://auth-service:3001`, service JWT, DTOs cerrados y Problem Details, con UI solo en desarrollo (Component: Auth OpenAPI; Trace: Constitution VII; Depends on: AUTH-002) in `apps/auth-service/src/interfaces/openapi/openapi.factory.ts` and `apps/auth-service/src/interfaces/openapi/openapi.module.ts`
- [X] AUTH-024 [P] Crear harness PostgreSQL 16/Redis 7 aislado con migraciones reales, limpieza determinista y fixtures sintéticos, sin mocks de persistencia en suites integration (Component: Auth integration harness; Trace: Constitution VIII; Depends on: AUTH-004, AUTH-006) in `apps/auth-service/test/integration/dependencies.setup.ts` and `apps/auth-service/test/fixtures/auth.fixture.ts`
- [X] AUTH-025 Integrar los módulos base en `AppModule`, aplicar validación/errores/trazas globales y garantizar que el puerto 3001 permanezca en la red interna (Component: Auth bootstrap; Trace: Plan §5/§7; Depends on: AUTH-010–AUTH-024) in `apps/auth-service/src/app.module.ts` and `apps/auth-service/src/main.ts`

**Checkpoint**: Auth dispone de configuración, Prisma, criptografía, service-auth, cliente Users,
errores, observabilidad, health, Swagger y harness de integración reutilizable.

---

### Phase 3: User Story 1 — Registrar una cuenta con rol (Priority: P1) — parte Auth de RQ-02

**Goal**: Coordinar de forma durable e idempotente la creación de identidad y credencial hasta
que ambas estén activas, sin persistir datos personales ni exponer estados parciales.

**Independent Test**: Con un stub contractual de Users y dependencias reales de Auth, el handler
interno que respalda `POST /auth/register` crea una sola cuenta `GUEST|OWNER`, reanuda reintentos
y converge a éxito completo o cancelación sin permitir autenticación parcial.

#### Tests for User Story 1

- [ ] AUTH-026 [P] [US1] Escribir primero pruebas de contrato para `POST /internal/v1/registrations`, handler que respalda `POST /auth/register`, con service JWT, `Idempotency-Key` UUID, DTO cerrado y respuestas 201/400/409/503 (Component: Registration contract; Trace: RQ-02, FR-001–FR-006; Depends on: AUTH-004, AUTH-014, AUTH-023) in `apps/auth-service/test/contract/registration.contract.spec.ts`
- [X] AUTH-027 [P] [US1] Escribir primero pruebas unitarias de contraseña exacta 8–128 sin trim/case-fold/normalización, roles públicos `GUEST|OWNER` y rechazo de `ADMIN` (Component: Registration policy; Trace: RQ-02, FR-001–FR-003; Depends on: AUTH-004) in `apps/auth-service/test/unit/registration-policy.spec.ts`
- [X] AUTH-028 [P] [US1] Escribir primero pruebas unitarias del fingerprint HMAC canónico sin contraseña cruda, UUID estable y conflicto al reutilizar la clave con payload distinto (Component: Registration idempotency; Trace: FR-005–FR-006; Depends on: AUTH-004) in `apps/auth-service/test/unit/registration-idempotency.spec.ts`
- [X] AUTH-029 [P] [US1] Escribir primero pruebas unitarias de transiciones `STARTED→USER_PENDING→CREDENTIAL_PENDING→CREDENTIAL_ACTIVE→COMPLETED` y `COMPENSATING→CANCELLED` (Component: Registration state machine; Trace: FR-005; Depends on: AUTH-004) in `apps/auth-service/test/unit/registration-state.spec.ts`
- [ ] AUTH-030 [P] [US1] Escribir primero pruebas de integración PostgreSQL para unicidad/idempotencia concurrente y bloqueo de una misma Registration (Component: Registration persistence concurrency; Trace: FR-005–FR-006; Depends on: AUTH-024) in `apps/auth-service/test/integration/registration-concurrency.spec.ts`
- [ ] AUTH-031 [P] [US1] Escribir primero pruebas de integración de saga con stub Users: éxito, timeout tras cada paso, reanudación, respuesta conflictiva y cero confirmaciones parciales (Component: Registration saga integration; Trace: RQ-02, FR-005–FR-006, SC-002–SC-003; Depends on: AUTH-021, AUTH-024) in `apps/auth-service/test/integration/registration-saga.spec.ts`
- [ ] AUTH-032 [P] [US1] Escribir primero pruebas de integración del reconciliador para intervalo, lote, cinco intentos, backoff, TTL 15 minutos, `SKIP LOCKED`, finalización y compensación (Component: Registration reconciliation; Trace: FR-005–FR-006; Depends on: AUTH-024) in `apps/auth-service/test/integration/registration-reconciler.spec.ts`
- [ ] AUTH-033 [P] [US1] Escribir primero pruebas de seguridad que demuestren ausencia de contraseña, hash, token, correo y estados internos sensibles en logs/respuestas (Component: Registration security; Trace: FR-024, Constitution V; Depends on: AUTH-013, AUTH-024) in `apps/auth-service/test/security/registration-secrets.spec.ts`

#### Implementation for User Story 1

- [X] AUTH-034 [P] [US1] Modelar `Credential` con `userId` externo sin FK, `passwordHash`, estado `PENDING|ACTIVE|REVOKED` y timestamps (Component: Credential model; Trace: RQ-02, FR-005, FR-024; Depends on: AUTH-006) in `apps/auth-service/prisma/schema.prisma` and `apps/auth-service/src/domain/credentials/credential.ts`
- [X] AUTH-035 [US1] Modelar `Registration` con id de `Idempotency-Key`, fingerprint, `userId`, estado, intentos, error seguro, expiración y timestamps, extendiendo el mismo schema sin conflicto de edición (Component: Registration model; Trace: FR-005–FR-006; Depends on: AUTH-034) in `apps/auth-service/prisma/schema.prisma` and `apps/auth-service/src/domain/registrations/registration.ts`
- [X] AUTH-036 [US1] Crear migración inicial de Credential/Registration con enums, constraints e índices necesarios para reclamo concurrente e idempotencia (Component: Registration migration; Trace: FR-005–FR-006, Constitution III; Depends on: AUTH-034–AUTH-035) in `apps/auth-service/prisma/migrations/001_auth_registration/migration.sql`
- [X] AUTH-037 [P] [US1] Implementar política de registro para contraseña exacta, roles públicos y fingerprint canónico que nunca incluya el secreto (Component: Registration domain rules; Trace: RQ-02, FR-001–FR-003, FR-006; Depends on: AUTH-027–AUTH-028, AUTH-034–AUTH-035) in `apps/auth-service/src/domain/registrations/registration-policy.ts`
- [X] AUTH-038 [P] [US1] Implementar máquina de estados y reglas de expiración/reintento/compensación de Registration (Component: Registration domain; Trace: FR-005–FR-006; Depends on: AUTH-029, AUTH-035) in `apps/auth-service/src/domain/registrations/registration-state-machine.ts`
- [X] AUTH-039 [P] [US1] Implementar repositorios Prisma de Registration/Credential con transacciones, locks y persistencia de errores seguros (Component: Registration repositories; Trace: FR-005–FR-006; Depends on: AUTH-011, AUTH-036) in `apps/auth-service/src/infrastructure/persistence/prisma/registration.repository.ts` and `apps/auth-service/src/infrastructure/persistence/prisma/credential.repository.ts`
- [ ] AUTH-040 [US1] Implementar `RegisterAccountUseCase` que crea/reanuda la saga, asigna UUID estable, solicita identidad `PENDING`, hashea contraseña, activa credencial e identidad y confirma solo ambos lados `ACTIVE` (Component: Registration use case; Trace: RQ-02, FR-001–FR-006; Depends on: AUTH-018, AUTH-021, AUTH-037–AUTH-039) in `apps/auth-service/src/application/registration/register-account.use-case.ts`
- [ ] AUTH-041 [P] [US1] Implementar operaciones tipadas del cliente Users para crear, consultar, activar y cancelar una identidad por `registrationId`, enviando nombre/correo/rol pero nunca contraseña (Component: Users registration adapter; Trace: RQ-02, FR-004–FR-006; Depends on: AUTH-021; External dependency: G2 debe congelar `openapi-users-service.yaml`) in `apps/auth-service/src/infrastructure/http/users-registration.client.ts`
- [ ] AUTH-042 [US1] Integrar las operaciones Users en la saga y mapear timeout/dependencia caída a `503` sin afirmar éxito ni perder el estado reanudable (Component: Registration dependency handling; Trace: FR-005–FR-006, Constitution IV; Depends on: AUTH-040–AUTH-041) in `apps/auth-service/src/application/registration/register-account.use-case.ts`
- [ ] AUTH-043 [US1] Implementar reconciliador programado cada 30 segundos con lote `SKIP LOCKED`, máximo cinco intentos/backoff, TTL 15 minutos y compensación idempotente (Component: Registration reconciler; Trace: FR-005–FR-006; Depends on: AUTH-038–AUTH-042) in `apps/auth-service/src/application/registration/reconcile-registrations.use-case.ts` and `apps/auth-service/src/modules/registration/registration-reconciler.service.ts`
- [X] AUTH-044 [P] [US1] Implementar DTO de registro cerrado y decoradores Swagger, preservando contraseña exactamente como llega y aceptando solo `GUEST|OWNER` (Component: Registration DTO; Trace: RQ-02, FR-001–FR-003; Depends on: AUTH-012, AUTH-023, AUTH-037) in `apps/auth-service/src/interfaces/http/dto/register.request.ts` and `apps/auth-service/src/interfaces/http/dto/register.response.ts`
- [ ] AUTH-045 [US1] Implementar controlador interno `POST /internal/v1/registrations` detrás de service JWT como handler de Auth para `POST /auth/register` (Component: Registration controller; Trace: RQ-02, FR-001–FR-006; Depends on: AUTH-026, AUTH-040–AUTH-044) in `apps/auth-service/src/interfaces/http/registration.controller.ts`
- [ ] AUTH-046 [US1] Componer `RegistrationModule` y `CredentialsModule` con puertos/adaptadores explícitos y sin lógica de negocio en controlador (Component: Registration modules; Trace: Constitution I–II; Depends on: AUTH-039–AUTH-045) in `apps/auth-service/src/modules/registration/registration.module.ts` and `apps/auth-service/src/modules/credentials/credentials.module.ts`
- [ ] AUTH-047 [US1] Sincronizar el contrato OpenAPI propio de Auth para registro, incluidos service JWT, idempotencia, DTOs, 201/400/409/503 y ausencia de campos secretos (Component: Registration OpenAPI; Trace: RQ-02, FR-001–FR-006, Constitution VII; Depends on: AUTH-044–AUTH-046) in `specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml`
- [ ] AUTH-048 [US1] Ejecutar y cerrar las suites unit/contract/integration/security de US1, demostrando migración limpia, fallo previo a implementación, ≥70% de cobertura afectada y trazabilidad RQ-02 (Component: Registration verification; Trace: RQ-02, SC-002–SC-003, Constitution VIII; Depends on: AUTH-026–AUTH-047) in `apps/auth-service/test/`

**Checkpoint**: La parte Auth de RQ-02 queda implementable y verificable de forma aislada con un
stub contractual de Users; ningún estado parcial es autenticable.

---

### Phase 4: User Story 2 — Iniciar y renovar sesión (Priority: P1)

**Goal**: Autenticar sin enumerar cuentas, emitir JWT/sesión, rotar refresh tokens y validar la
sesión con rol inmutable para respaldar protección y autorización por roles.

**Independent Test**: Con identidad ACTIVE resuelta por un stub contractual de Users, los
handlers que respaldan `POST /auth/login`, `POST /auth/refresh` y `GET /auth/validate` cumplen
duraciones, claims, límite antiabuso, rotación/replay y respuestas 401/429/503.

#### Tests for User Story 2

- [ ] AUTH-049 [P] [US2] Escribir primero pruebas de contrato para `POST /internal/v1/login`, handler que respalda `POST /auth/login`, con service JWT, DTO cerrado y respuestas 200/401/429/503 (Component: Login contract; Trace: FR-007–FR-010; Depends on: AUTH-004, AUTH-014, AUTH-023) in `apps/auth-service/test/contract/login.contract.spec.ts`
- [ ] AUTH-050 [P] [US2] Escribir primero pruebas de contrato para `POST /internal/v1/sessions/refresh`, handler que respalda `POST /auth/refresh`, sin cookie en el contrato interno y con respuestas 200/401/503 (Component: Refresh contract; Trace: FR-009–FR-012; Depends on: AUTH-004, AUTH-014, AUTH-023) in `apps/auth-service/test/contract/refresh.contract.spec.ts`
- [ ] AUTH-051 [P] [US2] Escribir primero pruebas de contrato para `POST /internal/v1/sessions/validate`, handler que respalda `GET /auth/validate`, devolviendo solo `active` y rol inmutable o 401/503 (Component: Session validation contract; Trace: FR-009, FR-011–FR-013; Depends on: AUTH-004, AUTH-014, AUTH-023) in `apps/auth-service/test/contract/session-validation.contract.spec.ts`
- [ ] AUTH-052 [P] [US2] Escribir primero pruebas unitarias de login para Argon2id real/señuelo, Credential/User ACTIVE y 401 genérico indistinguible (Component: Login security; Trace: FR-007–FR-008; Depends on: AUTH-004, AUTH-018) in `apps/auth-service/test/unit/login.use-case.spec.ts`
- [ ] AUTH-053 [P] [US2] Escribir primero pruebas unitarias del access JWT RS256 de 3600 segundos con `sub,sid,role,jti,iss,aud,iat,exp`, `kid` y rechazo de algoritmo/claims inválidos (Component: Access JWT; Trace: FR-009–FR-013; Depends on: AUTH-004, AUTH-019) in `apps/auth-service/test/unit/access-token.spec.ts`
- [X] AUTH-054 [P] [US2] Escribir primero pruebas unitarias de sesión con rol inmutable y expiración absoluta exacta de siete días no extendida por refresh (Component: Session domain; Trace: FR-009–FR-010; Depends on: AUTH-004) in `apps/auth-service/test/unit/session.spec.ts`
- [ ] AUTH-055 [P] [US2] Escribir primero pruebas de integración PostgreSQL para rotación atómica concurrente, un solo sucesor y replay que revoca sesión/familia completa (Component: Refresh concurrency; Trace: FR-010, SC-003; Depends on: AUTH-024) in `apps/auth-service/test/integration/refresh-rotation.spec.ts`
- [ ] AUTH-056 [P] [US2] Escribir primero pruebas de integración Redis del límite de cinco fallos por HMAC(correo normalizado)/15 minutos, sexto 429 con `Retry-After`, limpieza por éxito y 503 si Redis falla (Component: Login rate limit; Trace: FR-007–FR-008, Plan §5; Depends on: AUTH-024) in `apps/auth-service/test/integration/login-rate-limit.spec.ts`
- [ ] AUTH-057 [P] [US2] Escribir primero pruebas de integración de validación con PostgreSQL autoritativo, caché acotada al access token, fallback seguro y sesión revocada/expirada (Component: Session validation; Trace: FR-009–FR-013, SC-003; Depends on: AUTH-024) in `apps/auth-service/test/integration/session-validation.spec.ts`
- [ ] AUTH-058 [P] [US2] Escribir primero pruebas de seguridad para Passport/guards, 401 versus 403, allowlist RS256, rotación de `kid` y ausencia de tokens/hashes en logs/respuestas (Component: Auth security; Trace: FR-011–FR-013, FR-024; Depends on: AUTH-013–AUTH-014, AUTH-019, AUTH-024) in `apps/auth-service/test/security/authentication-authorization.spec.ts`

#### Implementation for User Story 2

- [X] AUTH-059 [P] [US2] Modelar `Session` con `userId`, rol inmutable, expiración absoluta, revocación y versión de concurrencia (Component: Session model; Trace: FR-009–FR-013; Depends on: AUTH-006) in `apps/auth-service/prisma/schema.prisma` and `apps/auth-service/src/domain/sessions/session.ts`
- [X] AUTH-060 [US2] Modelar `RefreshToken` con hash HMAC único, estado `ACTIVE|CONSUMED|REVOKED`, expiración, consumo y sucesor, extendiendo el mismo schema sin conflicto de edición (Component: Refresh model; Trace: FR-010; Depends on: AUTH-059) in `apps/auth-service/prisma/schema.prisma` and `apps/auth-service/src/domain/tokens/refresh-token.ts`
- [X] AUTH-061 [US2] Crear migración de Session/RefreshToken con FK local, self-reference, constraints e índices para lookup, expiración, lock y revocación (Component: Session migration; Trace: FR-009–FR-013, Constitution III; Depends on: AUTH-059–AUTH-060) in `apps/auth-service/prisma/migrations/002_auth_sessions/migration.sql`
- [X] AUTH-062 [P] [US2] Implementar repositorios Prisma de Session/RefreshToken con lock transaccional, control de versión y revocación de descendientes (Component: Session repositories; Trace: FR-009–FR-010; Depends on: AUTH-011, AUTH-061) in `apps/auth-service/src/infrastructure/persistence/prisma/session.repository.ts` and `apps/auth-service/src/infrastructure/persistence/prisma/refresh-token.repository.ts`
- [ ] AUTH-063 [P] [US2] Implementar resolución de identidad ACTIVE por correo normalizado mediante contrato Users, sin persistir correo ni recuperar perfil completo (Component: Login Users adapter; Trace: FR-004, FR-007–FR-009; Depends on: AUTH-021; External dependency: G2 debe congelar el lookup de identidad en `openapi-users-service.yaml`) in `apps/auth-service/src/infrastructure/http/users-login-identity.client.ts`
- [ ] AUTH-064 [P] [US2] Implementar contador antiabuso atómico por HMAC del correo normalizado, incluyendo cuentas inexistentes, ventana 15 minutos, máximo cinco fallos y limpieza por éxito (Component: Login rate limiter; Trace: FR-007–FR-008, Plan §5; Depends on: AUTH-020, AUTH-056) in `apps/auth-service/src/application/login/login-rate-limiter.ts`
- [ ] AUTH-065 [US2] Implementar `LoginUseCase` que resuelve identidad vigente, verifica hash real/señuelo con coste equivalente, exige User/Credential ACTIVE, crea Session y devuelve tokens o 401 genérico (Component: Login use case; Trace: FR-007–FR-010; Depends on: AUTH-039, AUTH-052–AUTH-054, AUTH-062–AUTH-064) in `apps/auth-service/src/application/login/login.use-case.ts`
- [ ] AUTH-066 [P] [US2] Implementar emisión de access JWT RS256 y token refresh opaco con entropía suficiente, persistiendo solo HMAC/hash y fijando expiraciones 1 hora/7 días (Component: Token issuance; Trace: FR-009–FR-010, FR-024; Depends on: AUTH-019, AUTH-053–AUTH-054, AUTH-060–AUTH-062) in `apps/auth-service/src/application/sessions/issue-session-tokens.service.ts`
- [ ] AUTH-067 [US2] Implementar `RotateRefreshTokenUseCase` con lock de sesión/token, consumo único, sucesor, mismo vencimiento absoluto y revocación total ante replay (Component: Refresh use case; Trace: FR-010, SC-003; Depends on: AUTH-055, AUTH-062, AUTH-066) in `apps/auth-service/src/application/sessions/rotate-refresh-token.use-case.ts`
- [ ] AUTH-068 [US2] Implementar `ValidateSessionUseCase` con PostgreSQL autoritativo, caché Redis limitada por TTL restante del access token y rol inmutable (Component: Session validation use case; Trace: FR-009, FR-011–FR-013; Depends on: AUTH-057, AUTH-062) in `apps/auth-service/src/application/sessions/validate-session.use-case.ts`
- [ ] AUTH-069 [P] [US2] Implementar estrategia Passport JWT, guard de acceso y guard/decorador de roles usando claims canónicos y validación de sesión, con 401 para autenticación y 403 para permiso insuficiente (Component: Authentication and authorization; Trace: FR-011–FR-013; Depends on: AUTH-019, AUTH-053, AUTH-058, AUTH-068) in `apps/auth-service/src/interfaces/http/auth/jwt.strategy.ts`, `apps/auth-service/src/interfaces/http/guards/access-token.guard.ts` and `apps/auth-service/src/interfaces/http/guards/roles.guard.ts`
- [X] AUTH-070 [P] [US2] Implementar DTOs cerrados de login, refresh y validación de sesión con decoradores Swagger, sin aceptar rol ni identidad aportados fuera de sus contratos (Component: Session DTOs; Trace: FR-007–FR-013; Depends on: AUTH-012, AUTH-023) in `apps/auth-service/src/interfaces/http/dto/login.dto.ts`, `apps/auth-service/src/interfaces/http/dto/refresh.dto.ts` and `apps/auth-service/src/interfaces/http/dto/validate-session.dto.ts`
- [ ] AUTH-071 [US2] Implementar controladores internos de login, refresh y validación detrás de service JWT como handlers de Auth para `POST /auth/login`, `POST /auth/refresh` y `GET /auth/validate` (Component: Auth controllers; Trace: FR-007–FR-013; Depends on: AUTH-049–AUTH-051, AUTH-065, AUTH-067–AUTH-070) in `apps/auth-service/src/interfaces/http/login.controller.ts` and `apps/auth-service/src/interfaces/http/sessions.controller.ts`
- [ ] AUTH-072 [US2] Componer `LoginModule`, `SessionsModule`, `TokensModule` y `ServiceAuthModule` con puertos/adaptadores explícitos y sin lógica de negocio en controladores (Component: Auth modules; Trace: Constitution I–II; Depends on: AUTH-062–AUTH-071) in `apps/auth-service/src/modules/{login,sessions,tokens,service-auth}/`
- [ ] AUTH-073 [US2] Sincronizar el contrato OpenAPI propio de Auth para login, refresh y validación, incluidos service JWT, DTOs, 200/401/429/503, `Retry-After` y rol autoritativo (Component: Session OpenAPI; Trace: FR-007–FR-013, Constitution VII; Depends on: AUTH-070–AUTH-072) in `specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml`
- [ ] AUTH-074 [US2] Ejecutar y cerrar las suites unit/contract/integration/security de US2, demostrando migración limpia, fallo previo a implementación, ≥70% de cobertura afectada y resultados SC-002/SC-003 (Component: Session verification; Trace: FR-007–FR-013, SC-002–SC-003, Constitution VIII; Depends on: AUTH-049–AUTH-073) in `apps/auth-service/test/`

**Checkpoint**: Login, refresh, validación, Passport, guards y autorización quedan verificables
en Auth sin que este servicio publique rutas de borde ni administre perfiles.

---

### Phase 5: Contratos externos, integración y cierre de Auth

**Purpose**: Verificar las fronteras de Auth con G2 y G1, siempre desde artefactos y suites
propiedad del Grupo 3.

- [ ] AUTH-075 [P] Validar automáticamente que Swagger generado por Auth coincide con `openapi-auth-service.yaml`, cubre las cuatro operaciones internas y no filtra secretos (Component: Auth contract drift; Trace: Constitution V/VII; Depends on: AUTH-047, AUTH-073) in `scripts/validate-auth-openapi.mjs` and `apps/auth-service/test/contract/openapi-drift.spec.ts`
- [ ] AUTH-076 [P] Ejecutar pruebas consumer-driven Auth→Users para crear/consultar/activar/cancelar registro con service JWT, timeout e idempotencia (Component: Auth-Users registration contract; Trace: RQ-02, FR-001–FR-006; Depends on: AUTH-048; External dependency: G2 entrega contrato y provider verificable de registro) in `apps/auth-service/test/contract/users-registration.consumer.spec.ts`
  - Parte Auth↔Users acreditada con Users real: create/GET/activate/cancel conformes al OpenAPI, service JWT (INT-16) e idempotencia (INT-02/05/14). Sigue abierta porque el timeout literal solo se probó con el doble de Users (`users-registration-adapter.spec.ts`) y falta la aprobación contractual de G2. Evidencia 2026-09-30: `npm run test:auth-users` y `agents/integracion/resultado.md`.
- [X] AUTH-077 [P] Ejecutar pruebas consumer-driven Auth→Users para lookup de correo normalizado que retorna solo `userId`, rol y estado ACTIVE (Component: Auth-Users login contract; Trace: FR-004, FR-007–FR-009; Depends on: AUTH-074; External dependency: G2 entrega contrato y provider verificable de lookup) in `apps/auth-service/test/contract/users-login-identity.consumer.spec.ts`
  - Acreditada contra Users real sin Gateway: `test/contract/users-login-identity.consumer.spec.ts` (INT-08: exactamente `userId`/`role`/`status ACTIVE`, conforme al OpenAPI; ausente/PENDING/CANCELLED 404 indistinguibles). Evidencia 2026-09-30: `npm run test:auth-users` y `agents/integracion/resultado.md`.
- [ ] AUTH-078 [P] Ejecutar pruebas provider-driven para consumidores G1 que verifiquen registro/login/refresh/validate, service JWT, Problem Details y propagación de `traceId` (Component: Gateway-Auth contract; Trace: RQ-02, FR-001–FR-013; Depends on: AUTH-075; External dependency: G1 congela `openapi-public.yaml` y expectativas del consumidor) in `apps/auth-service/test/contract/gateway.provider.spec.ts`
- [ ] AUTH-079 Verificar integración Auth↔Users del registro completo y recuperación tras timeout en Compose sin consultar `users_db` directamente (Component: Auth-Users registration integration; Trace: RQ-02, FR-005–FR-006, SC-002; Depends on: AUTH-076; External dependency: endpoints G2 de registro disponibles) in `apps/auth-service/test/integration/cross-service-registration.spec.ts`
  - Parte Auth↔Users acreditada con Users real (INT-01–05, INT-14 pérdida de respuesta tras la escritura, INT-15 reconciliación), sin consultar `users_db` desde código productivo. Sigue abierta porque el harness automatizado usa procesos Node y bases en contenedor, no Compose, y porque el timeout literal no se ejecutó contra Users real. Evidencia 2026-09-30: `npm run test:auth-users` y `agents/integracion/resultado.md`.
- [X] AUTH-080 Verificar integración Auth↔Users del login con identidad ACTIVE/PENDING/CANCELLED, correo equivalente y caída de dependencia (Component: Auth-Users login integration; Trace: FR-004, FR-007–FR-009, SC-003; Depends on: AUTH-077; External dependency: endpoint G2 de lookup disponible) in `apps/auth-service/test/integration/cross-service-login.spec.ts`
  - Acreditada contra Users real sin Gateway: `test/integration/cross-service-login.spec.ts` (INT-06 correo equivalente, INT-07 PENDING/CANCELLED/ausente/contraseña errónea 401 genérico sin sesión) y `cross-service-recovery.spec.ts` (INT-13 Users caído → 503). Evidencia 2026-09-30: `npm run test:auth-users` y `agents/integracion/resultado.md`.
- [ ] AUTH-081 Verificar integración G1↔Auth de los cuatro mapeos públicos, incluida entrega del refresh solo en payload interno, introspección y conservación de 401/429/503 (Component: Gateway-Auth integration; Trace: RQ-02, FR-001–FR-013; Depends on: AUTH-078–AUTH-080; External dependency: G1 implementa routing, cookie segura y cliente Auth) in `apps/auth-service/test/integration/gateway-auth.spec.ts`
- [ ] AUTH-082 [P] Verificar build multi-stage, usuario no root, migración previa, healthchecks, red interna, `restart: always` y arranque limpio de Auth/PostgreSQL/Redis mediante Compose (Component: Auth container verification; Trace: Plan §7, Constitution technical constraints; Depends on: AUTH-008, AUTH-022, AUTH-074) in `apps/auth-service/test/integration/auth-compose.spec.ts`
- [ ] AUTH-083 [P] Auditar logs, trazas y respuestas de todos los flujos para confirmar redacción de contraseña, hashes, tokens, correo y errores internos (Component: Auth secret audit; Trace: FR-024, Constitution V; Depends on: AUTH-048, AUTH-074) in `apps/auth-service/test/security/no-secret-leakage.spec.ts`
- [ ] AUTH-084 Registrar evidencia final de cobertura ≥70%, contratos, migraciones, seguridad, concurrencia, Compose y trazabilidad RQ-02/FR-001–FR-013, sin marcar dependencias externas como cumplidas antes de su ejecución real (Component: Auth Definition of Done; Trace: SC-002–SC-003, SC-007, Constitution VIII; Depends on: AUTH-075–AUTH-083) in `specs/001-fundamentos-identidad/validation-report.md`

**Checkpoint**: El entregable del Grupo 3 cumple sus contratos y queda listo para integración; las
dependencias externas pendientes permanecen visibles y no se confunden con trabajo propio.

---

### Dependencies & Execution Order

#### Phase dependencies

- **Phase 1**: inicia de inmediato; `AUTH-003`–`AUTH-007` pueden repartirse tras `AUTH-001`.
- **Phase 2**: depende del setup y bloquea las historias; las tareas `[P]` se reparten por
  archivos, pero `AUTH-025` integra todo el fundamento.
- **Phase 3 / US1**: depende de Phase 2. Sus pruebas se escriben primero; `AUTH-041` puede usar
  stub hasta que G2 congele su contrato.
- **Phase 4 / US2**: depende de Phase 2 y puede comenzar en paralelo con US1. `AUTH-065` requiere
  el repositorio de Credential de US1 (`AUTH-039`); esta es la única dependencia interna entre
  historias antes del cierre.
- **Phase 5**: comienza con contratos/suites locales; `AUTH-079`–`AUTH-081` esperan entregables
  reales de G2/G1 y coordinación explícita.

#### External contract dependencies

| Consumer/producer | Contract needed by Auth | Owner/reviewer | Blocking tasks |
|---|---|---|---|
| Auth → Users (registro) | Crear, consultar, activar y cancelar por `registrationId`; DTO sin contraseña | G2 owner, G3 reviewer | `AUTH-041`, `AUTH-076`, `AUTH-079` |
| Auth → Users (login) | Resolver correo normalizado a `userId`, rol y estado | G2 owner, G3 reviewer | `AUTH-063`, `AUTH-077`, `AUTH-080` |
| G1 → Auth | Cuatro operaciones internas, service JWT, Problem Details y `traceId` | G3 owner, G1 reviewer | `AUTH-078`, `AUTH-081` |
| Rutas públicas | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/validate` y cookie | G1 owner, G3 reviewer | `AUTH-078`, `AUTH-081` |

#### Parallel plan for two people

- Tras `AUTH-001`, una persona puede preparar toolchain/tests/configuración y la otra
  Prisma/Docker; ambas convergen en `AUTH-008` y `AUTH-025`.
- Tras Phase 2, una persona puede desarrollar US1 y la otra comenzar modelos, pruebas y
  seguridad de US2; la segunda espera `AUTH-039` antes de cerrar `AUTH-065`.
- En Phase 5, contratos y seguridad `[P]` se ejecutan en paralelo; las integraciones
  `AUTH-079`–`AUTH-081` se hacen al recibir los providers de G2/G1.

### Implementation Strategy

#### MVP del Grupo 3

1. Completar Phase 1 y Phase 2.
2. Completar Phase 3 (parte Auth de registro RQ-02).
3. Validar US1 contra stub contractual de Users.
4. Incorporar Phase 4 para completar autenticación y sesiones del Sprint 1.

#### Definition of Done de Auth

- Los cuatro handlers internos respaldan exactamente los cuatro endpoints públicos solicitados.
- Auth solo persiste Credential, Registration, Session y RefreshToken en `auth_db`.
- Contraseñas usan Argon2id; access JWT usa RS256/3600 s; refresh mantiene expiración absoluta
  de siete días, rota una vez y revoca la sesión ante replay.
- Passport, guards y autorización distinguen 401/403 sin confiar en datos del cliente.
- OpenAPI, migraciones, imagen/Compose, healthchecks y configuración están sincronizados.
- Pruebas unitarias, integración, contrato y seguridad pasan con cobertura afectada ≥70%.
- La revisión confirma ausencia de lógica de routing de borde, perfiles y tareas de otros grupos.
