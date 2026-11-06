# Research: reviews-service

## 1. Arquitectura interna

**Decisión**: arquitectura hexagonal pragmática compatible con Auth, Users y Search: dominio puro, aplicación por casos/puertos, infraestructura por adaptadores e interfaces HTTP/OpenAPI.

**Rationale**: satisface la constitución, evita que Prisma/Nest/HTTP definan reglas y permite probar RQ-11 sin colaboradores reales.

**Alternativas consideradas**: CRUD NestJS directo mezcla negocio/transporte; CQRS completo o event sourcing no resuelve una necesidad demostrada.

## 2. ORM y almacenamiento

**Decisión**: PostgreSQL 16 propio y Prisma 6.19, ya adoptado por los servicios actuales.

**Rationale**: la relación una estadía→una reseña, los índices paginados y constraints son relacionales. Mantiene tooling y convenciones del monorepo.

**Alternativas consideradas**: TypeORM duplicaría ORM; MongoDB y Elasticsearch no aportan beneficio al alcance.

## 3. Validación de estadía

**Decisión**: REST síncrono hacia `GET /internal/v1/bookings/{bookingId}/review-eligibility`, autenticado con service JWT y `guestId` derivado del bearer.

**Rationale**: RQ-11 necesita una decisión autoritativa antes de persistir. Bookings ya planea estado `COMPLETED`, endpoint, fixture y provider tests en T079–T088.

**Alternativas consideradas**: leer `bookings_db` viola ownership; confiar en el cliente es inseguro; usar solo `booking.v1.completed` introduce consistencia eventual.

## 4. Evento `booking.v1.completed`

**Decisión**: documentarlo como extensión futura, no consumirlo en el incremento inicial.

**Rationale**: no se necesita proyección local y la creación seguiría requiriendo revalidación. Excluir RabbitMQ evita operación, Inbox/DLQ y estados desincronizados.

**Alternativas consideradas**: la proyección mejora autonomía de lectura, pero complica reparación y no garantiza frescura inmediata.

## 5. Identidad y autorización

**Decisión**: Gateway reenvía access bearer para creación/historial; Reviews lo revalida. Reviews usa service JWT propio al llamar Bookings. La consulta pública llega desde Gateway con service JWT.

**Rationale**: coincide con el patrón real de perfil en Users y aplica mínimo privilegio.

**Alternativas consideradas**: headers `x-user-id` son suplantables; token de servicio sin principal no demuestra autoría; llamar Auth/Users por request añade acoplamiento.

## 6. Cardinalidad e idempotencia

**Decisión**: una reseña por `bookingId`, garantizada por índice único; conflictos concurrentes producen error estable.

**Rationale**: una estadía completada es la unidad verificable de RQ-11 y la restricción evita spam/reintentos duplicados.

**Alternativas consideradas**: múltiples reseñas contradicen la unidad de experiencia; `Idempotency-Key` adicional no sustituye la regla y puede diferirse.

## 7. Comentario

**Decisión**: requerido, Unicode, trim en extremos, longitud 1..2.000; se conserva como texto y se omite de logs.

**Rationale**: el documento exige calificación y comentario; el límite protege request/DB/observabilidad sin introducir moderación.

**Alternativas consideradas**: comentario opcional reduce el alcance; sanitización destructiva altera texto. El frontend debe escapar HTML.

## 8. Privacidad

**Decisión**: listados públicos no exponen `guestId`/`bookingId`; endpoint por usuario es de ownership propio y no concede ADMIN una capacidad nueva.

**Rationale**: mínimo privilegio y ausencia de requisito para publicar identificadores.

**Alternativas consideradas**: historial público no está definido; nombre/foto exigiría Users y política nueva.

## 9. Caché y agregados

**Decisión**: no Redis ni tabla de promedios materializados.

**Rationale**: índices PostgreSQL cubren consultas y RQ-11 no exige promedio.

**Alternativas consideradas**: Redis o `ReviewSummary` pueden evaluarse con métricas y consumidor real futuro.

## 10. Operación y pruebas

**Decisión**: Node 20, NestJS 10, puerto 3007, imagen no-root, migración separada, live/ready, observabilidad, PostgreSQL real y suites unit/integration/contract/security/concurrency/performance/E2E.

**Rationale**: reutiliza el monorepo y satisface constitución/DoD; distingue stubs de integración real.

**Alternativas consideradas**: SQLite no prueba constraints/concurrencia; mocks exclusivos no demuestran migración ni contrato.

## 11. Dependencias y evidencia

**Decisión**: desarrollar contra consumer contract y stub; bloquear provider test/E2E real hasta T079–T088/T098. Gateway routing es otro gate externo.

**Rationale**: permite paralelismo sin afirmar integración inexistente.

**Alternativas consideradas**: esperar todo Bookings retrasa trabajo; copiar tablas/tipos internos genera acoplamiento prohibido.
