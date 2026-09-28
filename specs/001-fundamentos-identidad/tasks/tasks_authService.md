---

description: "Dependency-ordered tasks exclusively for Sprint 1 auth-service Group"
---

# Tasks: Fundamentos e identidad — Grupo 3 `auth-service`

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

## Phase 1: Setup de `auth-service`

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

## Phase 2: Fundamentos bloqueantes de `auth-service`

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

## Phase 3: User Story 1 — Registrar una cuenta con rol (Priority: P1) — parte Auth de RQ-02

**Goal**: Coordinar de forma durable e idempotente la creación de identidad y credencial hasta
que ambas estén activas, sin persistir datos personales ni exponer estados parciales.

**Independent Test**: Con un stub contractual de Users y dependencias reales de Auth, el handler
interno que respalda `POST /auth/register` crea una sola cuenta `GUEST|OWNER`, reanuda reintentos
y converge a éxito completo o cancelación sin permitir autenticación parcial.

### Tests for User Story 1

- [ ] AUTH-026 [P] [US1] Escribir primero pruebas de contrato para `POST /internal/v1/registrations`, handler que respalda `POST /auth/register`, con service JWT, `Idempotency-Key` UUID, DTO cerrado y respuestas 201/400/409/503 (Component: Registration contract; Trace: RQ-02, FR-001–FR-006; Depends on: AUTH-004, AUTH-014, AUTH-023) in `apps/auth-service/test/contract/registration.contract.spec.ts`
- [X] AUTH-027 [P] [US1] Escribir primero pruebas unitarias de contraseña exacta 8–128 sin trim/case-fold/normalización, roles públicos `GUEST|OWNER` y rechazo de `ADMIN` (Component: Registration policy; Trace: RQ-02, FR-001–FR-003; Depends on: AUTH-004) in `apps/auth-service/test/unit/registration-policy.spec.ts`
- [X] AUTH-028 [P] [US1] Escribir primero pruebas unitarias del fingerprint HMAC canónico sin contraseña cruda, UUID estable y conflicto al reutilizar la clave con payload distinto (Component: Registration idempotency; Trace: FR-005–FR-006; Depends on: AUTH-004) in `apps/auth-service/test/unit/registration-idempotency.spec.ts`
- [X] AUTH-029 [P] [US1] Escribir primero pruebas unitarias de transiciones `STARTED→USER_PENDING→CREDENTIAL_PENDING→CREDENTIAL_ACTIVE→COMPLETED` y `COMPENSATING→CANCELLED` (Component: Registration state machine; Trace: FR-005; Depends on: AUTH-004) in `apps/auth-service/test/unit/registration-state.spec.ts`
- [ ] AUTH-030 [P] [US1] Escribir primero pruebas de integración PostgreSQL para unicidad/idempotencia concurrente y bloqueo de una misma Registration (Component: Registration persistence concurrency; Trace: FR-005–FR-006; Depends on: AUTH-024) in `apps/auth-service/test/integration/registration-concurrency.spec.ts`
- [ ] AUTH-031 [P] [US1] Escribir primero pruebas de integración de saga con stub Users: éxito, timeout tras cada paso, reanudación, respuesta conflictiva y cero confirmaciones parciales (Component: Registration saga integration; Trace: RQ-02, FR-005–FR-006, SC-002–SC-003; Depends on: AUTH-021, AUTH-024) in `apps/auth-service/test/integration/registration-saga.spec.ts`
- [ ] AUTH-032 [P] [US1] Escribir primero pruebas de integración del reconciliador para intervalo, lote, cinco intentos, backoff, TTL 15 minutos, `SKIP LOCKED`, finalización y compensación (Component: Registration reconciliation; Trace: FR-005–FR-006; Depends on: AUTH-024) in `apps/auth-service/test/integration/registration-reconciler.spec.ts`
- [ ] AUTH-033 [P] [US1] Escribir primero pruebas de seguridad que demuestren ausencia de contraseña, hash, token, correo y estados internos sensibles en logs/respuestas (Component: Registration security; Trace: FR-024, Constitution V; Depends on: AUTH-013, AUTH-024) in `apps/auth-service/test/security/registration-secrets.spec.ts`

### Implementation for User Story 1

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

## Phase 4: User Story 2 — Iniciar y renovar sesión (Priority: P1)

**Goal**: Autenticar sin enumerar cuentas, emitir JWT/sesión, rotar refresh tokens y validar la
sesión con rol inmutable para respaldar protección y autorización por roles.

**Independent Test**: Con identidad ACTIVE resuelta por un stub contractual de Users, los
handlers que respaldan `POST /auth/login`, `POST /auth/refresh` y `GET /auth/validate` cumplen
duraciones, claims, límite antiabuso, rotación/replay y respuestas 401/429/503.

### Tests for User Story 2

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

### Implementation for User Story 2

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

## Phase 5: Contratos externos, integración y cierre de Auth

**Purpose**: Verificar las fronteras de Auth con G2 y G1, siempre desde artefactos y suites
propiedad del Grupo 3.

- [ ] AUTH-075 [P] Validar automáticamente que Swagger generado por Auth coincide con `openapi-auth-service.yaml`, cubre las cuatro operaciones internas y no filtra secretos (Component: Auth contract drift; Trace: Constitution V/VII; Depends on: AUTH-047, AUTH-073) in `scripts/validate-auth-openapi.mjs` and `apps/auth-service/test/contract/openapi-drift.spec.ts`
- [ ] AUTH-076 [P] Ejecutar pruebas consumer-driven Auth→Users para crear/consultar/activar/cancelar registro con service JWT, timeout e idempotencia (Component: Auth-Users registration contract; Trace: RQ-02, FR-001–FR-006; Depends on: AUTH-048; External dependency: G2 entrega contrato y provider verificable de registro) in `apps/auth-service/test/contract/users-registration.consumer.spec.ts`
- [ ] AUTH-077 [P] Ejecutar pruebas consumer-driven Auth→Users para lookup de correo normalizado que retorna solo `userId`, rol y estado ACTIVE (Component: Auth-Users login contract; Trace: FR-004, FR-007–FR-009; Depends on: AUTH-074; External dependency: G2 entrega contrato y provider verificable de lookup) in `apps/auth-service/test/contract/users-login-identity.consumer.spec.ts`
- [ ] AUTH-078 [P] Ejecutar pruebas provider-driven para consumidores G1 que verifiquen registro/login/refresh/validate, service JWT, Problem Details y propagación de `traceId` (Component: Gateway-Auth contract; Trace: RQ-02, FR-001–FR-013; Depends on: AUTH-075; External dependency: G1 congela `openapi-public.yaml` y expectativas del consumidor) in `apps/auth-service/test/contract/gateway.provider.spec.ts`
- [ ] AUTH-079 Verificar integración Auth↔Users del registro completo y recuperación tras timeout en Compose sin consultar `users_db` directamente (Component: Auth-Users registration integration; Trace: RQ-02, FR-005–FR-006, SC-002; Depends on: AUTH-076; External dependency: endpoints G2 de registro disponibles) in `apps/auth-service/test/integration/cross-service-registration.spec.ts`
- [ ] AUTH-080 Verificar integración Auth↔Users del login con identidad ACTIVE/PENDING/CANCELLED, correo equivalente y caída de dependencia (Component: Auth-Users login integration; Trace: FR-004, FR-007–FR-009, SC-003; Depends on: AUTH-077; External dependency: endpoint G2 de lookup disponible) in `apps/auth-service/test/integration/cross-service-login.spec.ts`
- [ ] AUTH-081 Verificar integración G1↔Auth de los cuatro mapeos públicos, incluida entrega del refresh solo en payload interno, introspección y conservación de 401/429/503 (Component: Gateway-Auth integration; Trace: RQ-02, FR-001–FR-013; Depends on: AUTH-078–AUTH-080; External dependency: G1 implementa routing, cookie segura y cliente Auth) in `apps/auth-service/test/integration/gateway-auth.spec.ts`
- [ ] AUTH-082 [P] Verificar build multi-stage, usuario no root, migración previa, healthchecks, red interna, `restart: always` y arranque limpio de Auth/PostgreSQL/Redis mediante Compose (Component: Auth container verification; Trace: Plan §7, Constitution technical constraints; Depends on: AUTH-008, AUTH-022, AUTH-074) in `apps/auth-service/test/integration/auth-compose.spec.ts`
- [ ] AUTH-083 [P] Auditar logs, trazas y respuestas de todos los flujos para confirmar redacción de contraseña, hashes, tokens, correo y errores internos (Component: Auth secret audit; Trace: FR-024, Constitution V; Depends on: AUTH-048, AUTH-074) in `apps/auth-service/test/security/no-secret-leakage.spec.ts`
- [ ] AUTH-084 Registrar evidencia final de cobertura ≥70%, contratos, migraciones, seguridad, concurrencia, Compose y trazabilidad RQ-02/FR-001–FR-013, sin marcar dependencias externas como cumplidas antes de su ejecución real (Component: Auth Definition of Done; Trace: SC-002–SC-003, SC-007, Constitution VIII; Depends on: AUTH-075–AUTH-083) in `specs/001-fundamentos-identidad/validation-report.md`

**Checkpoint**: El entregable del Grupo 3 cumple sus contratos y queda listo para integración; las
dependencias externas pendientes permanecen visibles y no se confunden con trabajo propio.

---

## Dependencies & Execution Order

### Phase dependencies

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

### External contract dependencies

| Consumer/producer | Contract needed by Auth | Owner/reviewer | Blocking tasks |
|---|---|---|---|
| Auth → Users (registro) | Crear, consultar, activar y cancelar por `registrationId`; DTO sin contraseña | G2 owner, G3 reviewer | `AUTH-041`, `AUTH-076`, `AUTH-079` |
| Auth → Users (login) | Resolver correo normalizado a `userId`, rol y estado | G2 owner, G3 reviewer | `AUTH-063`, `AUTH-077`, `AUTH-080` |
| G1 → Auth | Cuatro operaciones internas, service JWT, Problem Details y `traceId` | G3 owner, G1 reviewer | `AUTH-078`, `AUTH-081` |
| Rutas públicas | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/validate` y cookie | G1 owner, G3 reviewer | `AUTH-078`, `AUTH-081` |

### Parallel plan for two people

- Tras `AUTH-001`, una persona puede preparar toolchain/tests/configuración y la otra
  Prisma/Docker; ambas convergen en `AUTH-008` y `AUTH-025`.
- Tras Phase 2, una persona puede desarrollar US1 y la otra comenzar modelos, pruebas y
  seguridad de US2; la segunda espera `AUTH-039` antes de cerrar `AUTH-065`.
- En Phase 5, contratos y seguridad `[P]` se ejecutan en paralelo; las integraciones
  `AUTH-079`–`AUTH-081` se hacen al recibir los providers de G2/G1.

## Implementation Strategy

### MVP del Grupo 3

1. Completar Phase 1 y Phase 2.
2. Completar Phase 3 (parte Auth de registro RQ-02).
3. Validar US1 contra stub contractual de Users.
4. Incorporar Phase 4 para completar autenticación y sesiones del Sprint 1.

### Definition of Done de Auth

- Los cuatro handlers internos respaldan exactamente los cuatro endpoints públicos solicitados.
- Auth solo persiste Credential, Registration, Session y RefreshToken en `auth_db`.
- Contraseñas usan Argon2id; access JWT usa RS256/3600 s; refresh mantiene expiración absoluta
  de siete días, rota una vez y revoca la sesión ante replay.
- Passport, guards y autorización distinguen 401/403 sin confiar en datos del cliente.
- OpenAPI, migraciones, imagen/Compose, healthchecks y configuración están sincronizados.
- Pruebas unitarias, integración, contrato y seguridad pasan con cobertura afectada ≥70%.
- La revisión confirma ausencia de lógica de routing de borde, perfiles y tareas de otros grupos.
