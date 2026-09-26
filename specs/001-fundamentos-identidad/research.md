# Phase 0 Research: Fundamentos e identidad

## Repository baseline

**Decision**: tratar la implementación como greenfield y reutilizar solo las convenciones
documentadas en `tendencias.md` y la constitution.

**Rationale**: no existen fuentes, manifiestos, lockfiles, Dockerfiles, Compose, migraciones ni
historial Git. Las convenciones vinculantes son monorepo `apps/`, NestJS, React/Vite, gateway,
Auth/Users, PostgreSQL independiente, REST, RabbitMQ y OpenAPI.

**Alternatives considered**: atribuir al repositorio una estructura o dependencia ya adoptada.
Rechazada porque no hay evidencia.

## ORM

**Decision**: Prisma ORM 6.x únicamente, con cliente, esquema y migraciones independientes en
Auth y Users, encapsulado en infraestructura detrás de puertos.

**Rationale**: no hay legado que favorezca TypeORM. Prisma aporta tipos generados, migraciones
SQL explícitas, constraints y transacciones locales sin decorar el dominio. La línea 6.x se
fija por compatibilidad con Node 20/NestJS 10; un upgrade mayor exige revisar Node/ESM.

**Alternatives considered**: TypeORM tiene integración Nest directa, pero sin legado no compensa
el riesgo de acoplar entidades y persistencia. Usar ambos duplica migraciones y conocimiento.

Fuentes: [NestJS Prisma](https://docs.nestjs.com/recipes/prisma),
[Prisma con NestJS](https://docs.prisma.io/docs/guides/frameworks/nestjs) y
[transacciones Prisma](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).

## Workspace

**Decision**: npm workspaces, un `package-lock.json`, Node 20 y apps desplegables bajo `apps/`.

**Rationale**: npm acompaña Node, permite `npm ci` reproducible y no existe lockfile que
justifique pnpm/Yarn. `apps/` está exigido por Sprint 1.

**Alternatives considered**: otro package manager o repositorios separados; no tienen evidencia
ni encajan con el monorepo requerido.

## Ownership Auth/Users

**Decision**: Users posee identidad, correo normalizado, rol, perfil y foto. Auth posee
credencial, saga, sesiones y refresh. Auth referencia `userId` sin FK y consulta a Users para
resolver el correo vigente.

**Rationale**: respeta bases independientes, evita duplicar correo y hace inmediato su cambio.

**Alternatives considered**: base compartida (viola constitution), email duplicado/eventual
(aceptaría temporalmente el correo anterior) o agrupar perfil y credencial (rompe dominios).

## Registration consistency

**Decision**: saga REST síncrona, durable e idempotente, estados `PENDING/ACTIVE`, índice único
en Users y reconciliación/compensación.

**Rationale**: no existe ACID entre bases. Solo `ACTIVE` es visible/autenticable, preservando el
resultado funcional completo mientras el estado durable permite recuperar timeouts/crashes.

**Alternatives considered**: 2PC no está soportado; DB compartida viola ownership; RabbitMQ
eventual no da respuesta autoritativa y nunca debe transportar contraseña.

## Gateway

**Decision**: gateway NestJS como único borde HTTPS `/api/v1`; no añadir Nginx ni Kong.

**Rationale**: Sprint 1 pide gateway NestJS, no hay configuración previa y una segunda capa
duplicaría routing/políticas. El contrato versionado permite cambiar infraestructura después.

**Alternatives considered**: Kong y Nginx se evaluaron, pero no aportan capacidad necesaria en
esta feature que justifique otra tecnología y contenedor.

## Authentication and authorization

**Decision**: Argon2id; access JWT RS256 de 3600 s con claims mínimos; Passport valida
algoritmo, issuer, audience, firma y expiración; gateway y servicio aplican defensa en
profundidad; roles y ownership son guards separados.

**Rationale**: otros servicios verifican con clave pública sin poder emitir. La documentación
NestJS respalda bearer JWT, guards y verificación de `exp`; separar authN/authZ preserva 401/403.

**Alternatives considered**: HS256 compartiría capacidad de firma; validar solo en gateway
dejaría Users sin defensa; incluir PII en JWT expone y queda obsoleta.

Fuente: [NestJS Authentication](https://docs.nestjs.com/security/authentication).

## Refresh and revocation

**Decision**: refresh opaco aleatorio, solo hash/HMAC persistido, cookie HttpOnly/Secure,
rotación transaccional e historial consumido; replay revoca sesión. Gateway introspecciona
`sid`; PostgreSQL manda y Redis solo cachea con fallback seguro.

**Rationale**: detectar replay requiere estado incluso con refresh JWT. La introspección evita
que un access renovado siga válido una hora tras el replay.

**Alternatives considered**: refresh JWT stateless, localStorage y validación solo local del
access; rechazadas por replay, XSS o revocación diferida.

## REST and RabbitMQ

**Decision**: REST para todos los flujos de esta feature; RabbitMQ se incluye en Compose pero
no se usa hasta que exista un consumidor real.

**Rationale**: registro, login, refresh, validación y perfil requieren resultado inmediato.
Publicar un evento sin consumidor añade operación y contrato sin valor.

**Alternatives considered**: saga coreografiada y evento de perfil anticipado. Se posponen. Un
evento futuro deberá usar outbox, versión, retry y DLQ.

Fuente: [NestJS RabbitMQ](https://docs.nestjs.com/microservices/rabbitmq).

## Profile photo

**Decision**: JPEG/PNG de hasta 5 MiB en tabla 1:1 `ProfilePhoto` (`BYTEA`, metadata, digest) en
`users_db`, servida binaria por endpoint protegido.

**Rationale**: es la única persistencia aprobada con atomicidad local. Tabla separada evita
cargar el binario en consultas normales y permite migración futura sin cambiar contrato.

**Alternatives considered**: filesystem dificulta réplicas; base64 añade sobrecosto; object
storage introduce infraestructura y consistencia no aprobadas.

## Profile concurrency

**Decision**: optimistic locking con `version`/`expectedVersion`; conflicto y correo duplicado
devuelven `409` con códigos distintos.

**Rationale**: evita last-write-wins sin locks largos entre GET y PATCH.

**Alternatives considered**: sobrescritura silenciosa viola la spec; locks de larga vida no son
fiables ni escalables.

## Profile HTTP semantics

**Decision**: usar `PATCH /users/{id}/profile`, aunque `tendencias.md` bosqueje `PUT`, porque la
spec aclarada ordena que campos omitidos se conserven y permite cambios parciales atómicos.

**Rationale**: PATCH expresa la semántica real y evita que consumidores interpreten una omisión
como reemplazo/eliminación. El endpoint sigue bajo el mismo recurso de perfil documentado.

**Alternatives considered**: PUT con omisiones preservadas sería semánticamente sorprendente;
PUT de reemplazo completo obligaría a reenviar foto/datos y elevaría conflictos.

## OpenAPI and validation

**Decision**: contratos separados para gateway, Auth y Users; `@nestjs/swagger` genera y CI
compara/lint. ValidationPipe usa whitelist/rechazo; errores Problem Details uniformes.

**Rationale**: hace visibles los límites y detecta drift.

**Alternatives considered**: solo Swagger agregado oculta contratos internos; documentación
manual sin comparación deriva.

Fuentes: [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction) y
[NestJS Validation](https://docs.nestjs.com/techniques/validation).

## Testing

**Decision**: Jest/RTL/Supertest, PostgreSQL real, contratos OpenAPI y Playwright en Compose;
logs JSON con `traceId`; cobertura afectada mínima 70%.

**Rationale**: índices, transacciones, locks y límites de servicios no se verifican con mocks.

**Alternatives considered**: solo unit tests o DB en memoria no prueban concurrencia,
migraciones, contratos ni composición.

## Centralized logging

**Decision**: instrumentar las apps con OpenTelemetry y enviar logs OTLP a OpenTelemetry
Collector, que los almacena centralmente en Loki; conservar salida JSON sin PII como fallback.

**Rationale**: cumple la exigencia de logs centralizados con un protocolo abierto y desacopla
las aplicaciones del backend. Loki admite ingestión OTLP nativa mediante Collector en Compose.

**Alternatives considered**: solo logs Docker no son centralizados; un logging driver Loki
requiere instalar plugins en cada host y reduce portabilidad.

Fuente: [OpenTelemetry Collector y Loki](https://grafana.com/docs/loki/latest/send-data/otel/otel-collector-getting-started/).

## Result

No quedan decisiones técnicas de investigación sin resolver.
