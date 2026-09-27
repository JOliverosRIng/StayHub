# Implementation Plan: Fundamentos e identidad

**Branch**: `001-fundamentos-identidad` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: `spec.md`, la constitution de StayHub y el estado real del repositorio.

## Summary

Implementar el primer corte vertical de identidad en un monorepo TypeScript con React 18/Vite
y tres aplicaciones NestJS 10: API Gateway, `auth-service` y `users-service`. Users será la
fuente autoritativa de identidad, correo, rol y perfil; Auth poseerá credenciales, sesiones y
refresh tokens. Cada servicio persistente usará su propia base PostgreSQL 16 y su propio esquema
Prisma, sin acceso cruzado.

El registro será una saga REST síncrona, durable e idempotente: identidad y credencial quedan
internas como `PENDING` hasta estar completas y luego pasan a `ACTIVE`. Login resuelve siempre
el correo vigente en Users. El access token será JWT RS256 de una hora; el refresh token será
opaco, tendrá límite absoluto de siete días, rotará en cada uso y su reutilización revocará toda
la sesión.

## Technical Context

**Language/Version**: TypeScript estricto, Node.js 20 LTS, NestJS 10, React 18.

**Primary Dependencies**: Passport (`passport-local`, `passport-jwt`), `@nestjs/jwt`,
`@nestjs/swagger`, Prisma ORM 6.x, Argon2id, OpenTelemetry SDK, React Router, Axios, TanStack
Query, Vite, Jest, React Testing Library, Supertest, Playwright y k6.

**Storage**: `auth_db` y `users_db` en PostgreSQL 16; Redis 7 como caché no autoritativa de
sesiones, con fallback a PostgreSQL, y autoridad efímera de contadores antiabuso; foto en
`BYTEA` de `users_db`. RabbitMQ 3-management se incluye en Compose, pero esta feature no publica
eventos porque no existe consumidor.

**Testing**: Jest/RTL para unidad, PostgreSQL real y Supertest para integración, validación de
OpenAPI, Playwright sobre Docker Compose para E2E y k6 para rendimiento; cobertura mínima 70%
del código afectado.

**Target Platform**: contenedores Linux mediante Docker Compose y navegadores modernos.

**Project Type**: aplicación web distribuida en monorepo.

**Performance Goals**: después de 30 s de calentamiento, sostener durante 2 minutos dos flujos
simultáneos de 25 solicitudes/s —consulta de perfil propio y validación de acceso— con selección
uniforme entre 100 usuarios `ACTIVE`, p95 menor de 500 ms por operación y menos de 1% de errores
inesperados. En navegador, al menos 19 de 20 actualizaciones válidas muestran confirmación en
menos de 5 s (SC-005).

**Constraints**: HTTPS en el borde; secretos fuera del repositorio; validación JWT en gateway y
servicio; whitelist de entradas; correo normalizado único; actualizaciones locales atómicas;
timeout en REST interno; fallo cerrado; bases independientes.

**Scale/Scope**: Sprint 1, cuatro recorridos principales, tres aplicaciones backend, un
frontend y dos bases. No existe una cifra de usuarios aprobada; las apps serán stateless para
permitir réplicas y mantendrán estado en PostgreSQL/Redis.

## Repository Assessment

El repositorio es greenfield: solo contiene documentación y Spec Kit. No hay `package.json`,
lockfile, configuración Nest/Vite, fuentes, Dockerfiles, Compose, migraciones ni historial Git.
No existe una convención ORM implementada que reutilizar.

Sí se conservan las decisiones documentales de `tendencias.md`: monorepo `apps/`, NestJS 10,
React 18/Vite, gateway, Auth en 3001, Users en 3002, PostgreSQL por servicio, REST, RabbitMQ,
Swagger y Docker Compose. Las nuevas elecciones están justificadas en
[research.md](./research.md).

## Constitution Check

*GATE inicial y posterior a Phase 1: PASS tras registrar y reconciliar las decisiones cerradas
el 2026-09-26.*

| Gate | Diseño y evidencia | Estado |
|---|---|---|
| Dominios | Auth posee credenciales/sesiones; Users identidad/rol/perfil; Gateway compone. | PASS |
| Capas | `domain`, `application`, `infrastructure`, `interfaces`; Prisma/Nest no entran al dominio. | PASS |
| Datos independientes | Dos PostgreSQL, usuarios y migraciones separados; UUID cross-service sin FK. | PASS |
| Comunicación | REST documentado y con timeout para resultados inmediatos; sin eventos sin consumidor. | PASS |
| Seguridad | HTTPS, RS256, Passport, introspección, roles, ownership, cookies seguras y Argon2id. | PASS |
| Modularidad/tipos | TypeScript estricto, puertos, adaptadores y DTOs separados del ORM. | PASS |
| Contratos | OpenAPI público y por servicio, incluida seguridad, errores y multipart. | PASS |
| Verificación | Unidad, integración, contrato y E2E; negativos/concurrencia; cobertura ≥70%. | PASS |
| Docker | Compose, healthchecks, migraciones, secretos y restart explícito. | PASS |

La reevaluación posterior al diseño mantiene todos los gates en `PASS`. ADMIN queda como
dependencia externa, `PENDING` cumple atomicidad observable, la contraseña y los límites de
abuso están definidos, el rol autoritativo se fija por sesión y la verificación no funcional es
reproducible. No se comparte base, no se incorpora un segundo ORM y no se usa mensajería en
operaciones autoritativas.

## Services and Responsibilities

### API Gateway

- Aplicación NestJS y único borde `/api/v1`; termina HTTPS, enruta, limita tamaño/tasa,
  genera/propaga `traceId` y elimina cabeceras de identidad aportadas por clientes.
- Valida firma/claims con Passport y consulta a Auth para confirmar que `sid` siga activa. Si
  Auth no responde, devuelve `503`; nunca concede acceso por fallo.
- No se añade Nginx ni Kong: Sprint 1 pide gateway NestJS, no existe configuración previa y una
  segunda capa duplicaría políticas. El prefijo versionado permite revisarlo después.

### `auth-service`

- Posee credenciales, saga de registro, sesiones, hashes de refresh tokens y claves de firma;
  nunca persiste correo ni perfil.
- Firma RS256 con `kid`; solo Auth conoce la clave privada. Gateway/Users usan clave pública.
- PostgreSQL es fuente de verdad; Redis acelera validación. Si Redis falla, consulta PostgreSQL.

### `users-service`

- Posee usuario, correo normalizado/único, rol, estado, perfil, foto y versión.
- Resuelve correo para login, participa en registro y actualiza el perfil transaccionalmente.
- Revalida JWT y ownership. Todos los roles editan solo su propio perfil; ningún endpoint
  público asigna `ADMIN`; su aprovisionamiento y todo cambio de rol quedan fuera de esta feature.

### Frontend `web`

- Pantallas/rutas de registro, login y perfil; access token solo en memoria.
- Refresh token solo en cookie `HttpOnly`, `Secure`, `SameSite=Strict`, limitada a
  `/api/v1/auth/refresh`; nunca en `localStorage`.
- Serializa refresh; ante 401 renueva/reintenta una sola vez. Ante 403 no renueva.

## Module Architecture

```text
interfaces (HTTP, DTO, guards, Swagger)
        ↓
application (use cases, ports, orchestration)
        ↓
domain (entities, value objects, policies, errors)
        ↑
infrastructure (Prisma, Redis, JWT, Argon2, HTTP, config)
```

- Gateway: `RoutingModule`, `GatewayAuthModule`, `SessionIntrospectionModule`,
  `RateLimitModule`, `ObservabilityModule`, `HealthModule`.
- Auth: `RegistrationModule`, `CredentialsModule`, `LoginModule`, `SessionsModule`,
  `TokensModule`, `ServiceAuthModule`, `PersistenceModule`, `HealthModule`.
- Users: `UsersModule`, `ProfilesModule`, `RolesModule`, `RegistrationStateModule`,
  `LoginLookupModule`, `PhotosModule`, `ServiceAuthModule`, `PersistenceModule`, `HealthModule`.
- Web: `features/auth`, `features/profile`, `router`, `shared/api`, `shared/session`.

DTOs OpenAPI no son modelos Prisma. `libs/contracts` comparte contratos/códigos, nunca lógica
de negocio, entidades ORM ni acceso a datos.

## Runtime Flows

### Registration

1. Gateway limita a 10 solicitudes por origen de red en una ventana móvil de 10 minutos; cuenta
   todo intento y responde `429` con `Retry-After` desde el undécimo. Web genera
   `Idempotency-Key` UUID y envía nombre, correo, contraseña de 8–128 caracteres sin transformarla
   y rol al gateway. El origen es la IP del socket salvo que la conexión provenga de un proxy
   incluido en una allowlist explícita, en cuyo caso se usa su dirección de cliente validada.
2. Auth crea o reanuda una `Registration` durable. Misma clave+payload devuelve igual resultado;
   misma clave+payload distinto devuelve `409`.
3. Users normaliza el correo con `trim().toLowerCase()`, aplica índice único y crea usuario y
   perfil `PENDING` en una transacción.
4. Auth calcula Argon2id y crea la credencial `PENDING` asociada al UUID.
5. Auth activa credencial y ordena activar usuario. Solo cuando ambos están `ACTIVE` retorna
   `201`; únicamente usuarios `ACTIVE` son visibles/autenticables.
6. Timeout se reintenta con identificadores idénticos. Una reconciliación compensa o expira
   pendientes huérfanos. Estado interno `PENDING` no es una cuenta funcional parcial.

Dos registros simultáneos se resuelven por la restricción única. No se usa RabbitMQ ni se
transportan secretos por mensajes.

### Login

1. Gateway limita a 30 intentos por origen de red en 5 minutos. Auth limita a 5 fallos por
   HMAC del correo normalizado en 15 minutos, exista o no la cuenta; el sexto devuelve el mismo
   `429` genérico con `Retry-After`. Un éxito limpia solo el contador del identificador. Los
   contadores viven en Redis sin correo en claro; si la autoridad no está disponible, se falla
   cerrado con `503`.
2. Auth normaliza correo y llama a Users; este devuelve solo `{userId, role, status}` si ACTIVE.
3. Auth verifica Argon2id por `userId`. Correo inexistente, estado no activo o contraseña
   incorrecta devuelven igual `401 INVALID_CREDENTIALS`, con coste comparable.
4. Auth copia el rol ACTIVE resuelto a una sesión inmutable, crea `absoluteExpiresAt = login +
   7 días`, primer refresh y access JWT de 3600 s. Gateway devuelve access token y coloca
   refresh cookie.

### Refresh

1. Gateway toma la cookie; no acepta refresh desde body/localStorage.
2. Auth hashea/HMAC el valor, abre transacción y bloquea sesión/token.
3. Si están activos y dentro del límite, marca token `CONSUMED`, inserta reemplazo `ACTIVE`,
   emite JWT de una hora con el rol inmutable de la sesión y rota cookie sin extender
   `absoluteExpiresAt`.
4. Token ausente, aleatorio, vencido o sesión revocada devuelve `401` y limpia cookie.
5. Token consumido prueba replay: revoca la sesión/familia y sucesores, invalida caché y exige
   login. Dos refresh concurrentes producen la misma detección; el frontend los serializa.

### JWT and authorization

- Claims: `sub`, `sid`, `role`, `jti`, `iss`, `aud`, `iat`, `exp`; sin PII ni secretos. `role` es
  la copia autoritativa e inmutable guardada en la sesión al hacer login.
- Passport fija RS256, issuer y audience. Gateway introspecciona `sid` y recibe `active` y `role`;
  rechaza diferencias entre el claim y la sesión. Users repite firma/claims y compara `sub` con
  el usuario objetivo. Un proceso futuro de cambio de rol debe revocar primero las sesiones.
- Orden: autenticación (`401`), rol/ownership (`403`). `ADMIN` no accede a perfiles ajenos en
  esta feature.

### Profile

1. GET retorna perfil y `version`.
2. PATCH usa `multipart/form-data`: parte JSON `profile` y archivo opcional `photo`. Omitido
   conserva; `null` elimina campos opcionales; `photo:null` elimina foto; archivo la reemplaza;
   archivo+`photo:null` es `400`.
3. Users rechaza campos desconocidos/restringidos y valida nombre, correo, E.164, preferencias,
   magic bytes JPEG/PNG y 5 MiB.
4. `expectedVersion`, datos y foto se guardan en una transacción. Versión obsoleta o correo
   duplicado devuelve `409`, sin cambios. La foto se sirve binaria, no base64.
5. Auth no almacena correo: el nuevo funciona inmediatamente y el anterior deja de resolver.

## API Contracts

- [openapi-public.yaml](./contracts/openapi-public.yaml): borde HTTPS `/api/v1`.
- [openapi-auth-service.yaml](./contracts/openapi-auth-service.yaml): API Auth.
- [openapi-users-service.yaml](./contracts/openapi-users-service.yaml): API Users.

| Método | Ruta pública | Auth | Respuestas principales |
|---|---|---|---|
| POST | `/auth/register` | Pública + Idempotency-Key | 201/400/409/503 |
| POST | `/auth/login` | Pública | 200/400/401/429/503 |
| POST | `/auth/refresh` | Cookie | 200/401/503 |
| GET | `/auth/validate` | Bearer | 200/401/503 |
| GET | `/users/{userId}/profile` | Bearer + ownership | 200/401/403/404 |
| PATCH | `/users/{userId}/profile` | Bearer + ownership | 200/400/401/403/409/413/415 |
| GET | `/users/{userId}/profile/photo` | Bearer + ownership | 200/401/403/404 |

Errores usan Problem Details: `type`, `title`, `status`, `detail`, `instance`, `code`, `traceId`
y `errors[]` solo para campos. Nunca contienen secretos, hashes, tokens ni confirman una cuenta.
REST interno usa timeout, circuit breaker y retry limitado a operaciones idempotentes.

## Data and Integration

El modelo está en [data-model.md](./data-model.md). Cada servicio posee migraciones/credenciales;
`userId` en Auth es referencia externa, no FK. La consistencia usa estados e idempotencia, no
transacciones distribuidas.

Los endpoints `/internal` exigen service JWT corto y con audiencia/scope específico, firmado
por el llamador autorizado con claves montadas como secretos. El gateway reenvía el bearer del
usuario solo a rutas de perfil; Users no confía en cabeceras `x-user-*` ni en la red Docker como
mecanismo suficiente de autenticación.

RabbitMQ se levanta y verifica como infraestructura base, pero no hay evento en esta feature:
todos los flujos requieren respuesta autoritativa y no existe consumidor. Un evento futuro
exigirá outbox, esquema/versionado, routing, retry y DLQ antes de publicarse.

## Validation and Errors

- `ValidationPipe` con whitelist y rechazo de desconocidos; reglas repetidas en dominio.
- `400`: forma, rol ADMIN público, null prohibido, campo restringido/desconocido o multipart
  incompatible.
- `401`: credencial genérica o token ausente/inválido/vencido/reusado.
- `403`: JWT válido sin rol/ownership; `404`: recurso propio/foto ausente.
- `409`: email duplicado, versión obsoleta o idempotencia incompatible.
- `413`/`415`: tamaño/media type; `429`: rate limit; `503`: dependencia autoritativa caída.
- Logs JSON contienen `traceId`, servicio, operación y código, nunca correo, contraseña, token,
  hash o foto.

## Test Strategy

### Unit

- Normalización, roles, validadores, saga/idempotencia/compensación.
- Argon2, claims/guards, ownership, límite absoluto, rotación/replay.
- Magic bytes/tamaño, versión y frontend refresh/retry 401/403.

### Integration and contract

- PostgreSQL 16 real: índices, transacciones, locks y concurrencia.
- Prisma por servicio y ausencia de conexión cross-database.
- Auth↔Users: timeout, retry, 503 y recuperación; Redis caído hace fallback seguro.
- Supertest y comparación/lint de Swagger generado contra OpenAPI versionado.

### E2E and security

- Compose + Playwright: registro guest/owner, admin rechazado, duplicados concurrentes;
  login sin enumeración; JWT válido/manipulado/vencido; refresh, límite, replay/concurrencia;
  401/403; perfil propio/ajeno; atomicidad, conflicto, cambio de correo y fotos.
- Verificar ausencia de secretos/PII en respuestas y logs; cobertura afectada ≥70%.

### Acceptance, usability and performance

- Playwright mide SC-005 desde el envío hasta la confirmación visible en 20 actualizaciones
  válidas; exige al menos 19 resultados menores de 5 s.
- Una prueba moderada con 20 participantes sin experiencia previa, divididos 10 huésped/10
  propietario y 10 registro inválido/10 actualización inválida, conserva evidencia agregada y
  desidentificada; exige 19/20 para SC-001 y 18/20 para SC-006 sin asistencia.
- k6, fijado por versión/digest en CI, ejecuta HTTPS con validación TLS sobre Compose: 100
  usuarios `ACTIVE`, 30 s de calentamiento y 2 minutos de medición con 25 solicitudes/s por cada
  operación. Umbrales: `p(95)<500 ms` por operación y errores inesperados `<1%`; se registran
  commit, runner, recursos, fecha, versión/digest y resultados.

## Docker and Operations

- Compose: `web`, `api-gateway`, `auth-service`, `users-service`, `auth-db`, `users-db`, Redis 7,
  RabbitMQ 3-management, OpenTelemetry Collector y Loki.
- Dockerfiles multi-stage Node 20, usuario no root, `package-lock.json` y `npm ci`.
- Jobs `auth-migrate`/`users-migrate` ejecutan `prisma migrate deploy`; nunca `db push` runtime.
- Health: `/health/live`, `/health/ready`, `pg_isready`, `redis-cli ping`,
  `rabbitmq-diagnostics ping` y health de OpenTelemetry Collector/Loki; dependencias esperan
  `service_healthy`/migración completada.
- `restart: always` en Auth y Gateway; políticas explícitas en los demás. Bases con volúmenes y
  credenciales distintas.
- Solo gateway HTTPS se expone; 3001/3002, DB y Redis quedan internos. RabbitMQ management solo
  en perfil dev.
- Certificados, JWT y credenciales por Docker secrets/variables no versionadas; `.env.example`
  solo documenta nombres.
- Las apps envían logs OTLP sin PII al OpenTelemetry Collector, que los centraliza en Loki;
  también mantienen JSON a stdout con rotación para diagnóstico si el collector falla.

## Swagger/OpenAPI

- Cada app genera OpenAPI con `@nestjs/swagger`; CI detecta drift contra `contracts/`.
- Documentar bearer/cookie/service auth, DTOs, enums, restricciones, multipart y errores.
- Swagger UI solo en desarrollo; los documentos internos no se publican fuera de la red.

## Project Structure

### Documentation

```text
specs/001-fundamentos-identidad/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi-public.yaml
│   ├── openapi-auth-service.yaml
│   └── openapi-users-service.yaml
└── tasks.md                  # posterior: $speckit-tasks
```

### Source Code

```text
apps/
├── api-gateway/src/{application,infrastructure,interfaces,modules}/
├── auth-service/
│   ├── prisma/{schema.prisma,migrations/}
│   └── src/{domain,application,infrastructure,interfaces,modules}/
├── users-service/
│   ├── prisma/{schema.prisma,migrations/}
│   └── src/{domain,application,infrastructure,interfaces,modules}/
└── web/src/{app,features,router,shared}/
libs/{contracts,observability,testing}/
infra/docker/{gateway,auth,users,web}/
infra/observability/{otel-collector.yaml,loki.yaml}/
docker-compose.yml
package.json
package-lock.json
nest-cli.json
tsconfig.base.json
.env.example
```

Cada app añade `test/{unit,integration,contract}`; Web añade `test/e2e`. Las aplicaciones son
desplegables independientes. Cada servicio persistente mantiene sus migraciones.

## Complexity Tracking

No hay violaciones constitucionales. Saga durable e introspección son complejidad necesaria
para compatibilizar bases independientes con FR-005 y revocación inmediata; las alternativas
rechazadas están en `research.md`.
