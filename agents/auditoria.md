# Revisión previa a los planes

Fecha: 2026-09-28. Commit revisado: `393a80d`. Revisión estática del código, contratos, migraciones, configuración y pruebas. Esta carpeta contiene planes; no constituye evidencia de implementación.

## Evidencia y límites

- El backlog tiene 84 tareas: 41 marcadas y 43 sin marcar.
- Se leyeron `spec.md`, `plan.md`, `data-model.md`, `tasks/tasks_authService.md`, los tres OpenAPI, la constitución y los archivos de Auth indicados abajo.
- Hay cuatro archivos `*.spec.ts`: registration-policy, registration-idempotency, registration-state y session, todos unitarios. Las carpetas integration, contract y security tienen preparación, pero ninguna suite de comportamiento.
- No se ejecutaron Jest, build ni integración: no existe `node_modules`; Node disponible es 22.22.2 frente al requisito 20; Docker no está instalado. No se instalaron herramientas para esta revisión documental.
- El árbol estaba limpio al empezar. No se encontraron archivos `AGENTS.md` dentro del repositorio.
- Durante la escritura de estos planes aparecieron cambios concurrentes en AppModule, main, trace interceptor, tsconfig.build, módulos Core/ServiceAuth y helpers HTTP/test. Se conservaron; no son cambios realizados por esta revisión. Los hallazgos describen la base inicial y deben contrastarse con el diff antes de implementar.
- Por tanto, “existe” significa código inspeccionado, no comportamiento certificado. La respuesta anterior interpretó las casillas como avance confirmado; esta revisión corrige esa limitación.

## Qué puede reutilizarse

| Elemento | Evidencia en el repositorio | Alcance comprobado por lectura |
|---|---|---|
| Workspace y configuración | package.json, apps/auth-service/package.json, tsconfig*, jest.config.ts | Nest 10, Prisma 6, TypeScript estricto, cuatro proyectos Jest |
| Dominio | src/domain/credentials, registrations, sessions, tokens | Entidades, snapshots, estados, fingerprint HMAC, expiraciones |
| Persistencia | prisma/schema.prisma, migrations/001*, migrations/002*, infrastructure/persistence/prisma | Cuatro tablas y adaptadores; índice parcial de un refresh ACTIVE por sesión |
| Seguridad | infrastructure/security | Argon2id real/señuelo, firma/verificación RS256, service JWT entrante/saliente |
| Redis | infrastructure/cache | Contador inicial, operaciones de caché y ping |
| HTTP | interfaces/http | DTO, ValidationPipe, Problem Details y guard de service JWT |
| Cliente Users | infrastructure/http/users-service.client.ts | Transporte genérico con timeout, retry y circuit breaker |
| Composición | app.module.ts, main.ts | Providers base y health; ningún controlador funcional de Auth |
| Operación | Dockerfile, docker-compose.yml, .github/workflows/ci.yml | Definiciones presentes; arranque y CI no ejecutados aquí |

Las rutas abreviadas de src y prisma corresponden a `apps/auth-service/`.

## Hallazgos que cambian la ejecución

| ID | Hallazgo concreto | Evidencia | Plan responsable |
|---|---|---|---|
| H01 | Falta GET de registro por registrationId en OpenAPI Users, aunque el puerto exige getRegistration | users-service.port.ts y openapi-users-service.yaml | PRE-004, AUTH-041 |
| H02 | Users devuelve id/name/email/role/status; el puerto solo declara userId/role/status. Auth devuelve id/name/email/role | mismos archivos y register.response.ts | PRE-004, AUTH-041, AUTH-040 |
| H03 | withLocked abre una transacción privada; save de otro repositorio usa el cliente raíz. No hay unidad transaccional sesión+tokens | session.repository.ts, refresh-token.repository.ts | PRE-003 |
| H04 | SELECT FOR UPDATE no protege una Registration inexistente; el upsert no resuelve por sí solo un conflicto de fingerprint | registration.repository.ts | PRE-002, AUTH-030 |
| H05 | No hay reclamo durable de lotes, lease ni programación de reintentos | Registration, repositorio y schema | PRE-002, AUTH-043 |
| H06 | Registration no guarda payload ni contraseña; un reconciliador no puede recrear por sí solo datos perdidos antes de persistir credencial | data-model y schema | decisiones D03, AUTH-032/040/043 |
| H07 | Falta revokeReason en Session del dominio, Prisma y SQL frente a data-model.md | session.ts, schema.prisma, 002 | PRE-003 |
| H08 | Falta lectura del contador/TTL; no hay secreto dedicado para HMAC de identificador; el filtro no emite Retry-After | cache.port.ts, auth-cache.adapter.ts, auth-config.ts, problem.filter.ts | AUTH-056/064 |
| H09 | verifyAccessToken descarta iat/exp y admite identificadores vacíos/no UUID; la estrategia Passport y sus dependencias no existen | token-signer.port.ts, rs256-token.service.ts, package.json | AUTH-053/069 |
| H10 | Registro/login rechazan correo con espacios antes de normalizar; nombre no se recorta. Respuestas token llevan writeOnly; expiresIn no especifica integer | DTO existentes | AUTH-026/044 (ajuste dentro de AUTH-045), AUTH-049/071/073 |
| H11 | Logger devuelve Error.message sin sanear; texto libre puede filtrar tokens. traceId se asigna después de guards | auth-logger.ts, trace.interceptor.ts, problem.filter.ts | AUTH-033/058/083 |
| H12 | OpenAPI es estático; script solo comprueba versión y cuatro rutas. Faltan errores 400/401 observables y Problem.errors/instance | check-auth-openapi-syntax.mjs, OpenAPI y mapper | AUTH-047/073/075 |
| H13 | No se inicia span HTTP explícito ni se propaga traceId al contexto del log de error | otel.ts, trace.interceptor.ts, problem.filter.ts | AUTH-083 |
| H14 | Riesgo de arranque: rootDir ../.. y aliases @auth con webpack false; CMD asume dist/main.js | tsconfig, nest-cli, Dockerfile | PRE-001, AUTH-082; confirmar con build |
| H15 | hasAppliedMigrations cuenta >=2; una tercera migración pendiente no impediría readiness | prisma.service.ts | PRE-002/003, AUTH-082 |
| H16 | ENTROPY_GENERATOR y USERS_SERVICE están declarados sin provider; providers raíz no se exportan a futuros módulos | ports e app.module.ts | PRE-001, AUTH-046/072 |
| H17 | Harness ejecuta flushdb y borrados sin comprobar base de pruebas; fixtures insuficientes para JWT/HTTP | test/integration/dependencies.setup.ts | PRE-001 |
| H18 | No hay implementaciones de Users/Gateway ni servicios Compose correspondientes | apps, compose | AUTH-076–081: dependencias externas |
| H19 | URL pública del contrato usa 8443; plan usa 8080. No hay prueba de que G1 haya acordado un puerto | openapi-public.yaml y plan | PRE-004, AUTH-081: URL configurable |
| H20 | Idempotency unit test solo compara fingerprints; no verifica UUID estable o conflicto HTTP; test Session no ejecuta refresh | cuatro suites existentes | AUTH-030/031/055 y cierres 048/074 |

Precisión sobre los DTO: la forma básica de RegisterResponse sí coincide con el OpenAPI de Auth; su enum es más estrecho y la incompatibilidad importante está en el mapeo de la respuesta de Users al puerto. No se necesita sustituir todos los DTO.

## Pendientes documentados

13 tareas de registro, 20 de login/sesiones y 10 de integración/cierre. Además se introducen PRE-001–004 como preparación de hallazgos; no se agregan funcionalidades de producto. Las tareas originales y sus casillas permanecen intactas.

No se certifica cobertura, seguridad, concurrencia, funcionamiento de Docker ni aprobación de contratos entre equipos. Los planes especifican la evidencia necesaria para obtener esa certificación.
