---

description: "Dependency-ordered tasks exclusively for Sprint 1 users-service Group"
---

# Tasks: Fundamentos e identidad — Grupo 2 `users-service`

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

## Phase 1: Setup de `users-service`

**Purpose**: Crear exclusivamente el workspace, toolchain y contenedores base de Users.

- [X] USR-001 Registrar `apps/users-service` como workspace NestJS 10/Node 20 con scripts de build, lint, typecheck, Prisma y test sin crear paquetes de otros servicios (Component: Users workspace; Trace: Plan §1/§4, Constitution VI; Depends on: none) in `package.json`, `package-lock.json` and `nest-cli.json`
- [X] USR-002 Crear bootstrap y estructura vacía `domain`, `application`, `infrastructure`, `interfaces` y `modules` para Users en puerto interno 3002 (Component: Users structure; Trace: Plan §2/§4; Depends on: USR-001) in `apps/users-service/src/main.ts`, `apps/users-service/src/app.module.ts` and `apps/users-service/src/{domain,application,infrastructure,interfaces,modules}/`
- [X] USR-003 [P] Configurar TypeScript estricto, aliases por capa y build independiente sin importar NestJS/Prisma desde dominio (Component: Users toolchain; Trace: Constitution II/VI; Depends on: USR-001) in `apps/users-service/tsconfig.json`, `apps/users-service/tsconfig.build.json` and `tsconfig.base.json`
- [X] USR-004 [P] Configurar Jest/Supertest y proyectos unit/integration/contract/security con umbral de cobertura afectada ≥70% (Component: Users test harness; Trace: Constitution VIII; Depends on: USR-001) in `apps/users-service/jest.config.ts` and `apps/users-service/test/{unit,integration,contract,security}/setup.ts`
- [X] USR-005 [P] Documentar variables exclusivas de Users: puerto 3002, `users_db`, JWT público, service-auth, límite 5.000.000 bytes y OTLP, sin secretos reales (Component: Users configuration; Trace: Plan §4/§7, Constitution V; Depends on: USR-001) in `.env.example` and `apps/users-service/README.md`
- [X] USR-006 [P] Configurar Prisma 6.x únicamente para PostgreSQL 16, cliente local y comandos `generate`, `migrate dev` y `migrate deploy`, prohibiendo `db push` en runtime (Component: Users ORM; Trace: Plan §2/§4; Depends on: USR-001) in `apps/users-service/prisma/schema.prisma` and `apps/users-service/package.json`
- [X] USR-007 [P] Crear Dockerfile multi-stage Node 20 con `npm ci`, generación Prisma, build del workspace, usuario no root y healthcheck compatible (Component: Users Docker image; Trace: Plan §7; Depends on: USR-001, USR-006) in `infra/docker/users/Dockerfile` and `infra/docker/users/.dockerignore`
- [X] USR-008 Integrar únicamente `users-service`, `users-db` y `users-migrate` con volumen/credenciales propios, red interna, readiness y política restart explícita (Component: Users Compose; Trace: Plan §7, Constitution III; Depends on: USR-002, USR-005–USR-007) in `docker-compose.yml`
- [X] USR-009 [P] Añadir etapas CI exclusivas de Users para instalación bloqueada, Prisma generate/migrate, lint, tipos, tests, cobertura, OpenAPI y build de imagen (Component: Users CI; Trace: Constitution VII–VIII; Depends on: USR-001, USR-004, USR-006–USR-007) in `.github/workflows/ci.yml`

**Checkpoint**: El workspace Users compila, Prisma genera cliente, la imagen se construye y el
harness de pruebas arranca sin requerir Auth o Gateway implementados.

---

## Phase 2: Fundamentos bloqueantes de `users-service`

**Purpose**: Establecer configuración, persistencia, seguridad, errores y documentación común.

**Critical**: Ninguna historia comienza hasta completar esta fase.

- [X] USR-010 Implementar configuración tipada y validada con fallo de arranque si faltan URL/credenciales de `users_db`, JWT issuer/audience/clave pública, service-auth, puerto, carga máxima u OTLP (Component: Users config; Trace: Plan §4, Constitution V; Depends on: USR-002, USR-005) in `apps/users-service/src/infrastructure/config/users-config.ts` and `apps/users-service/src/infrastructure/config/config.module.ts`
- [X] USR-011 Implementar `PrismaModule` y adaptador de conexión exclusivamente a `users_db`, con lifecycle, transacciones locales y cero acceso cross-database (Component: Users persistence; Trace: Constitution II–III; Depends on: USR-006, USR-010) in `apps/users-service/src/infrastructure/persistence/prisma/prisma.service.ts` and `apps/users-service/src/infrastructure/persistence/prisma/prisma.module.ts`
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

## Phase 3: User Story 1 — Registrar una cuenta con rol (Priority: P1) — parte Users de RQ-02

**Goal**: Crear, activar o cancelar una identidad idempotente bajo coordinación externa, sin
almacenar contraseña ni coordinar la saga.

**Independent Test**: Con service JWT sintético, los endpoints internos crean un único User
`PENDING`, activan/cancelan idempotentemente y nunca hacen visible/autenticable un estado parcial.

### Tests for User Story 1

- [ ] USR-022 [P] [US1] Escribir primero pruebas de contrato para POST `/internal/v1/registrations`, POST `/internal/v1/registrations/{registrationId}/activate` y POST `/internal/v1/registrations/{registrationId}/cancel` con service JWT, DTO cerrado y respuestas 201/200/204/400/404/409 (Component: Registration contract; Trace: RQ-02, FR-001–FR-006; Depends on: USR-004, USR-014, USR-019) in `apps/users-service/test/contract/registration.contract.spec.ts`
- [ ] USR-023 [P] [US1] Escribir primero pruebas unitarias de `trim().toLowerCase()`, nombre requerido 2–100 tras trim, correo máximo 254, roles públicos solo `GUEST|OWNER`, reconocimiento interno de `ADMIN` y estados `PENDING|ACTIVE|CANCELLED` (Component: Registration domain; Trace: FR-001–FR-004, BR-001–BR-002, BR-006; Depends on: USR-004) in `apps/users-service/test/unit/registration-policy.spec.ts`
- [ ] USR-024 [P] [US1] Escribir primero pruebas PostgreSQL de índice único `emailNormalized`, `registrationId` único y dos creaciones concurrentes con correos equivalentes, exigiendo una sola identidad (Component: Registration concurrency; Trace: FR-004, FR-006; Depends on: USR-020) in `apps/users-service/test/integration/registration-concurrency.spec.ts`
- [ ] USR-025 [P] [US1] Escribir primero pruebas integration de replays create/activate/cancel, transiciones válidas y consultas que excluyen PENDING/CANCELLED (Component: Registration state; Trace: FR-005–FR-006; Depends on: USR-020) in `apps/users-service/test/integration/registration-state.spec.ts`
- [ ] USR-026 [P] [US1] Escribir primero pruebas de seguridad para service JWT ausente, expirado, firma/issuer/audience/scope incorrectos, verificando 401/403 y cero llamadas al repositorio (Component: Registration service auth; Trace: Constitution V; Depends on: USR-014) in `apps/users-service/test/security/service-auth.spec.ts`

### Implementation for User Story 1

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

## Phase 4: User Story 2 — Resolver identidad para login (Priority: P1)

**Goal**: Entregar a Auth únicamente la identidad ACTIVE correspondiente al correo vigente, sin
implementar login, contraseña, JWT, sesiones ni refresh.

**Independent Test**: Con service JWT válido, un correo equivalente de usuario ACTIVE retorna
solo `userId,role,status`; correo ausente o estado no activo no expone perfil ni secretos.

### Tests for User Story 2

- [ ] USR-038 [P] [US2] Escribir primero prueba de contrato para POST `/internal/v1/login-identities/resolve` con service JWT, email máximo 254 y respuesta mínima `userId,role,status=ACTIVE` (Component: Login lookup contract; Trace: FR-007–FR-009; Depends on: USR-004, USR-014, USR-019) in `apps/users-service/test/contract/login-identity.contract.spec.ts`
- [ ] USR-039 [P] [US2] Escribir primero pruebas unitarias de lookup por correo normalizado que excluya PENDING/CANCELLED y nunca retorne nombre, correo, teléfono, preferencias o foto (Component: Login lookup policy; Trace: FR-007–FR-009, FR-024; Depends on: USR-023, USR-030) in `apps/users-service/test/unit/login-identity-policy.spec.ts`
- [ ] USR-040 [P] [US2] Escribir primero pruebas PostgreSQL para correo vigente, correo anterior tras actualización y estados no ACTIVE, verificando índice/consulta por `emailNormalized` (Component: Login lookup persistence; Trace: FR-004, FR-007, FR-017; Depends on: USR-028, USR-031) in `apps/users-service/test/integration/login-identity.spec.ts`

### Implementation for User Story 2

- [ ] USR-041 [US2] Añadir proyección Prisma mínima y método repository `findActiveLoginIdentityByNormalizedEmail` sin datos de perfil adicionales (Component: Login lookup repository; Trace: FR-007–FR-009, FR-024; Depends on: USR-039–USR-040) in `apps/users-service/src/infrastructure/persistence/prisma/login-identity.repository.ts`
- [ ] USR-042 [US2] Implementar `ResolveLoginIdentity` normalizando correo y retornando únicamente `userId`, rol y ACTIVE, con resultado indistinguible para ausente/no activo hacia el consumidor autorizado (Component: Login lookup use case; Trace: FR-007–FR-009; Depends on: USR-041) in `apps/users-service/src/application/login/resolve-login-identity.use-case.ts`
- [ ] USR-043 [US2] Exponer controlador/DTO interno de lookup protegido por scope service JWT de Auth, sin aceptar password ni datos de sesión (Component: Login lookup controller; Trace: FR-007–FR-009, Constitution V; Depends on: USR-014, USR-038, USR-042) in `apps/users-service/src/interfaces/http/internal/login-identity.controller.ts` and `apps/users-service/src/interfaces/http/internal/login-identity.dto.ts`
- [ ] USR-044 [US2] Generar/validar Swagger del lookup y dejar verdes sus suites, registrando que la autenticación final depende externamente de G3 (Component: US2 checkpoint; Trace: FR-007–FR-009, SC-007; Depends on: USR-038–USR-043) in `apps/users-service/src/interfaces/openapi/login-identity.openapi.ts`, `apps/users-service/test/` and `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml`

**Checkpoint**: Users resuelve identidad ACTIVE; no autentica credenciales ni crea sesiones.

---

## Phase 5: User Story 3 — Consultar y editar el perfil propio (Priority: P2) — RQ-01

**Goal**: Consultar y actualizar atómicamente el perfil/foto del usuario autenticado con todas
las validaciones, null semantics, unicidad y control optimista.

**Independent Test**: Un bearer válido consulta y actualiza su perfil; entradas inválidas,
correo duplicado, versión obsoleta o foto inválida no aplican cambios parciales.

### Tests for User Story 3

- [ ] USR-045 [P] [US3] Escribir primero pruebas de contrato GET/PATCH `/internal/v1/users/{userId}/profile` y GET `/internal/v1/users/{userId}/profile/photo` con bearer, multipart, 200/400/401/403/404/409/413/415 y Problem Details (Component: Profile contract; Trace: RQ-01, FR-014–FR-019, FR-023; Depends on: USR-004, USR-015, USR-019) in `apps/users-service/test/contract/profile.contract.spec.ts`
- [ ] USR-046 [P] [US3] Escribir primero pruebas unitarias: nombre 2–100 tras trim, correo válido máximo 254, teléfono E.164, máximo 20 preferencias escalares, omitido conserva, null elimina opcionales y nombre/correo null se rechazan (Component: Profile validation; Trace: FR-015–FR-016, FR-019; Depends on: USR-004) in `apps/users-service/test/unit/profile-validation.spec.ts`
- [ ] USR-047 [P] [US3] Escribir primero pruebas PostgreSQL de update `id+expectedVersion`, incremento de versión, email normalizado único, correo anterior/nuevo y rollback integral ante conflicto (Component: Profile atomicity; Trace: FR-017–FR-018, FR-023; Depends on: USR-020, USR-028) in `apps/users-service/test/integration/profile-update.spec.ts`
- [ ] USR-048 [P] [US3] Escribir primero pruebas de foto JPEG/PNG por magic bytes, límite exacto 5.000.000 bytes, digest/ETag, eliminación null, archivo+`photo:null` inválido y rollback (Component: Profile photo; Trace: FR-015–FR-016, FR-018–FR-019, FR-023; Depends on: USR-020) in `apps/users-service/test/integration/profile-photo.spec.ts`

### Models and migrations for User Story 3

- [ ] USR-049 [US3] Actualizar `ProfilePhoto` a `userId UUID PK/FK local`, `content BYTEA max 5.000.000`, `mediaType image/jpeg|image/png`, `byteSize 1..5.000.000`, `sha256 char(64)` y `updatedAt`; conservar User.version desde 1 (Component: Profile persistence model; Trace: FR-014–FR-018; Depends on: USR-046–USR-048) in `apps/users-service/prisma/schema.prisma`
- [ ] USR-050 [US3] Crear migración de foto con checks de tamaño máximo 5.000.000 bytes, media type, FK local e índices de versión/email (Component: Profile migration; Trace: FR-016–FR-018; Depends on: USR-049) in `apps/users-service/prisma/migrations/*_add_profile_photo/migration.sql`

### Implementation for User Story 3

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

## Phase 6: User Story 4 — Restringir modificaciones no autorizadas (Priority: P2)

**Goal**: Rechazar tokens inválidos, acceso cross-user y mass assignment antes de leer o mutar
el recurso objetivo.

**Independent Test**: Dos identidades y un fixture ADMIN demuestran que solo el propietario
puede consultar/editar su perfil y que todo rechazo deja la base intacta.

### Tests for User Story 4

- [ ] USR-061 [P] [US4] Escribir primero pruebas JWT directas para unsigned/`alg:none`, confusión HS256, clave/issuer/audience incorrectos, expiración y `sub`/`sid` ausentes o UUID no canónicos, exigiendo 401 y cero repositorio (Component: Users JWT hardening; Trace: FR-011–FR-013; Depends on: USR-004, USR-015) in `apps/users-service/test/security/jwt-hardening.spec.ts`
- [ ] USR-062 [P] [US4] Escribir primero pruebas unitarias de ownership para mismatch, ADMIN sin privilegio cross-user y precedencia autenticación→autorización (Component: Profile ownership; Trace: FR-020–FR-021, BR-004; Depends on: USR-004, USR-015) in `apps/users-service/test/unit/profile-authorization.spec.ts`
- [ ] USR-063 [P] [US4] Escribir primero pruebas integration donde IDs ajenos existentes/inexistentes producen el mismo 403 antes de lookup y cero lecturas/mutaciones (Component: Ownership non-disclosure; Trace: FR-020–FR-021, FR-024; Depends on: USR-020, USR-057) in `apps/users-service/test/integration/profile-ownership.spec.ts`
- [ ] USR-064 [P] [US4] Escribir primero pruebas mass-assignment para role, id, status, registrationId, credential, version override y desconocidos, exigiendo 400 y rollback completo (Component: Restricted fields; Trace: FR-019, FR-022–FR-023, BR-003/BR-005; Depends on: USR-020, USR-055–USR-057) in `apps/users-service/test/integration/profile-restricted-fields.spec.ts`

### Implementation for User Story 4

- [ ] USR-065 [US4] Endurecer estrategia JWT para satisfacer USR-061 con allowlist RS256, claims canónicos y autenticación antes de repositorio (Component: JWT authorization boundary; Trace: FR-011–FR-013; Depends on: USR-061, USR-015) in `apps/users-service/src/interfaces/http/auth/jwt.strategy.ts`
- [ ] USR-066 [US4] Implementar ownership guard `principal.sub == route.userId` antes del caso de uso, devolviendo 403 uniforme para toda identidad ajena incluido ADMIN (Component: Ownership guard; Trace: FR-020–FR-021; Depends on: USR-062–USR-063, USR-065) in `apps/users-service/src/interfaces/http/guards/profile-ownership.guard.ts`
- [ ] USR-067 [P] [US4] Implementar metadata/guard de roles reutilizable y probar roles mediante metadata de test sin crear endpoint productivo ni permisos no especificados (Component: Roles guard; Trace: FR-002, FR-013, BR-001; Depends on: USR-062, USR-065) in `apps/users-service/src/interfaces/http/guards/roles.guard.ts` and `apps/users-service/src/interfaces/http/guards/roles.decorator.ts`
- [ ] USR-068 [US4] Endurecer DTO/parser para rechazar todo campo restringido/desconocido antes del dominio y sin mutación parcial (Component: Mass-assignment protection; Trace: FR-019, FR-022–FR-023; Depends on: USR-064, USR-055–USR-056) in `apps/users-service/src/interfaces/http/profiles/update-profile.dto.ts` and `apps/users-service/src/interfaces/http/profiles/profile-multipart.interceptor.ts`
- [ ] USR-069 [US4] Actualizar controladores/Swagger con orden 401→403→validación, sin existencia diferenciable ni privilegios ADMIN ajenos (Component: Authorization HTTP/OpenAPI; Trace: FR-011–FR-013, FR-019–FR-024, Constitution VII; Depends on: USR-065–USR-068) in `apps/users-service/src/interfaces/http/profiles/profile.controller.ts`, `apps/users-service/src/interfaces/openapi/profile.openapi.ts` and `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml`
- [ ] USR-070 [US4] Ejecutar y dejar verdes suites security/unit/integration/contract de US4 y registrar FR-020–FR-024/SC-004 (Component: US4 checkpoint; Trace: SC-003–SC-004, SC-007; Depends on: USR-061–USR-069) in `apps/users-service/test/` and `specs/001-fundamentos-identidad/validation-report.md`

**Checkpoint**: Users aplica autenticación y ownership en defensa en profundidad sin depender de
que el borde sea confiable.

---

## Phase 7: Integración externa y cierre del Grupo 2

**Purpose**: Verificar los contratos con consumidores reales. Estas tareas permanecen al final
porque requieren entregables de G1 o G3.

- [ ] USR-071 Integrar Auth→Users para create/activate/cancel de registro, verificando service JWT/scopes, UUID estable, idempotencia, concurrencia, timeout/retry externo y PENDING nunca autenticable (Component: Auth↔Users registration integration; Trace: RQ-02, FR-001–FR-006; Depends on: USR-037; External dependency: G3 entrega cliente/orquestador, service JWT y contrato Auth compatibles) in `apps/users-service/test/integration/auth-registration-consumer.spec.ts`
- [ ] USR-072 Integrar Auth→Users para lookup de identidad ACTIVE, verificando correo vigente, exclusión de estados no activos, respuesta mínima y fallos seguros (Component: Auth↔Users login lookup; Trace: FR-007–FR-009, FR-017; Depends on: USR-044, USR-060; External dependency: G3 entrega consumidor lookup y comportamiento de login genérico) in `apps/users-service/test/integration/auth-login-consumer.spec.ts`
- [ ] USR-073 Integrar Gateway→Users para GET/PATCH/foto, verificando bearer reenviado, `traceId`, multipart/streaming, 401/403/404/409/413/415 y readiness/timeout (Component: Gateway↔Users profile integration; Trace: RQ-01, FR-011–FR-024; Depends on: USR-060, USR-070; External dependency: G1 entrega rutas, introspección previa, stripping de headers y contrato público compatibles) in `apps/users-service/test/integration/gateway-profile-consumer.spec.ts`
- [ ] USR-074 [P] Ejecutar pruebas provider/consumer de `openapi-users-service.yaml` con G1/G3 y cerrar drift únicamente en el contrato propiedad de G2 (Component: Users contract integration; Trace: Constitution VII, SC-007; Depends on: USR-036, USR-044, USR-059, USR-069; External dependency: G1/G3 aportan expectativas de consumidor aprobadas) in `apps/users-service/test/contract/users-provider.contract.spec.ts` and `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml`
- [ ] USR-075 Finalizar `users-service`, `users-db` y `users-migrate` en Compose con migración previa, red interna, puerto 3002 no publicado, healthchecks, secretos, volumen y restart explícito (Component: Users runtime integration; Trace: Plan §7, Constitution III; Depends on: USR-008, USR-018, USR-071–USR-073; External dependency: G1 integra nombres de red/readiness en Compose raíz) in `docker-compose.yml` and `infra/docker/users/`
- [ ] USR-076 [P] Automatizar lint/drift de OpenAPI Users y verificar que respuestas/logs no contienen credenciales, JWT, service JWT, correo, foto ni PII innecesaria (Component: Users contract/security CI; Trace: FR-024, Constitution V/VII; Depends on: USR-013, USR-074) in `scripts/validate-users-openapi.mjs`, `apps/users-service/test/security/secret-leakage.spec.ts` and `.github/workflows/ci.yml`
- [ ] USR-077 [P] Participar en E2E HTTPS del flujo registro→login→perfil→cambio de correo aportando fixtures Users y corrigiendo solo fallos dentro de Users (Component: Cross-service E2E participation; Trace: RQ-01, RQ-02, SC-002–SC-004; Depends on: USR-071–USR-073; External dependency: G1 ejecuta E2E y G3 entrega Auth operativo) in `apps/users-service/test/e2e/users-evidence.spec.ts` and `specs/001-fundamentos-identidad/validation-report.md`
- [ ] USR-078 Ejecutar CI/Compose final de Users, acreditar cobertura afectada ≥70%, migraciones, contratos, seguridad, concurrencia y revisión independiente, registrando bloqueos externos sin marcarlos completos (Component: Users Definition of Done; Trace: Constitution VIII/quality gates, SC-007; Depends on: USR-071–USR-077; External dependency: resultados coordinados de G1/G3 para integraciones) in `.github/workflows/ci.yml` and `specs/001-fundamentos-identidad/validation-report.md`

**Final checkpoint**: El Grupo 2 entrega Users y `users_db` ejecutables y probados. Ninguna tarea
implementa routing público, credenciales, login, emisión JWT, sesiones o refresh tokens.

---

## Dependencies and Execution Order

### Phase dependencies

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

### Parallel plan for two people

1. Ambos completan USR-001/USR-002 y acuerdan ownership de archivos.
2. Persona A trabaja Prisma/config/persistencia (`USR-006`, `USR-010`–`USR-011`, `USR-016`,
   `USR-020`); Persona B trabaja HTTP/security/observabilidad/OpenAPI (`USR-012`–`USR-015`,
   `USR-017`–`USR-019`).
3. En US1, una persona desarrolla dominio/repositorio y la otra contratos/controladores; se unen
   en el checkpoint.
4. Después de US1, una persona ejecuta US2 mientras la otra inicia validadores/pruebas de US3;
   ambas completan US3/US4 y se reparten Auth↔Users y Gateway↔Users en Phase 7.

## Implementation Strategy

### Suggested MVP

El MVP del Grupo 2 es Phase 1 + Phase 2 + US1 hasta USR-037: demuestra creación/activación/
cancelación idempotente de identidad mediante el contrato interno, sin afirmar que la saga Auth
esté integrada.

### Incremental delivery

1. Setup y Foundation.
2. US1 identidad de registro y roles.
3. US2 lookup mínimo para Auth.
4. US3 perfil/foto y cambio de correo.
5. US4 autorización adversarial.
6. Integraciones externas y Definition of Done.

## Notes

- No editar aplicaciones, bases, migraciones ni contenedores de G1/G3 desde estas tareas.
- No almacenar contraseñas, hashes de contraseña, sesiones o refresh tokens en `users_db`.
- No implementar login ni emitir/renovar access JWT dentro de Users.
- El límite autorizado de foto es exactamente 5.000.000 bytes en modelo, contratos y pruebas.
- Todo cambio de contrato Users requiere revisión de sus consumidores antes de integrarse.
- `[P]` no elimina dependencias explícitas ni permite cambios simultáneos sobre el mismo archivo.
