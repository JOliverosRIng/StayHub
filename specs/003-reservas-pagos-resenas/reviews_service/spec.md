# Feature Specification: Reviews Service de StayHub

**Feature**: `reviews_service`  
**Estado**: Base funcional para planificación técnica  
**Fecha**: 2026-11-05  
**Fuente de verdad**: `tendencias.md` RQ-11, contribución parcial a RQ-06, criterios del Sprint 3 y constitución StayHub 1.0.0.

## 1. Objetivo

Permitir que un huésped autenticado califique con una puntuación de 1 a 5 y comente una propiedad únicamente después de completar una estadía verificable. El servicio conserva las reseñas y permite consultarlas por propiedad y por el propio usuario, sin asumir responsabilidades de reservas, usuarios, alojamientos, pagos o frontend.

## 2. Alcance y trazabilidad

| Fuente | Cobertura del incremento |
|---|---|
| RQ-11 Calificar la propiedad | Cobertura principal: huésped autenticado, estadía `COMPLETED`, calificación 1–5, comentario y persistencia de la reseña. |
| RQ-06 Ver detalles de una propiedad | Contribución parcial: ofrece la colección paginada de reseñas que otro consumidor puede incorporar a la ficha. No construye la ficha completa. |
| Sprint 3 | Entregable backend `reviews-service` con calificaciones y comentarios. |

## 3. Historias de usuario y pruebas

### US1 — Crear una reseña tras completar la estadía (P1)

Como huésped autenticado, quiero calificar y comentar una propiedad en la que terminé una estadía para compartir mi experiencia.

**Criterios de aceptación**:

1. Un `GUEST` con una reserva propia en estado `COMPLETED` puede crear una reseña con puntuación entera entre 1 y 5 y comentario no vacío.
2. La identidad se toma del JWT validado; el cliente no puede decidir `guestId` ni `propertyId`.
3. `bookings-service` confirma autoritativamente la combinación `bookingId + guestId` y devuelve la propiedad asociada.
4. Una reserva inexistente, ajena, cancelada, pendiente o no completada no produce una reseña.
5. Una reserva solo origina una reseña; solicitudes concurrentes no crean duplicados.
6. Si Bookings no está disponible, la operación falla cerrada y no persiste datos.

### US2 — Consultar reseñas de una propiedad (P1)

Como visitante, quiero consultar las reseñas de una propiedad para conocer experiencias previas.

**Criterios de aceptación**:

1. La consulta devuelve una página estable ordenada por `createdAt DESC, id DESC`.
2. Una propiedad sin reseñas devuelve una página vacía y no obliga a consultar Accommodations.
3. La respuesta no expone identificadores internos del huésped, reservas ni datos personales.
4. El resultado aporta la parte de reseñas de RQ-06, pero no declara completa la ficha de la propiedad.

### US3 — Consultar las reseñas propias (P2)

Como huésped autenticado, quiero consultar las reseñas que he creado.

**Criterios de aceptación**:

1. El usuario solo puede solicitar el historial cuyo `userId` coincide con el `sub` de su JWT.
2. Consultar el historial de otro usuario se rechaza sin revelar si dicho usuario existe.
3. La consulta es paginada y mantiene orden determinista.

## 4. Requisitos funcionales

- **REV-FR-001**: aceptar únicamente puntuaciones enteras entre 1 y 5.
- **REV-FR-002**: exigir comentario no vacío, normalizado en extremos y limitado a 2.000 caracteres Unicode.
- **REV-FR-003**: obtener `guestId` de un JWT válido con rol `GUEST`.
- **REV-FR-004**: validar la elegibilidad mediante el contrato publicado por `bookings-service`.
- **REV-FR-005**: derivar `propertyId` de la respuesta autoritativa de Bookings.
- **REV-FR-006**: persistir como máximo una reseña por `bookingId`.
- **REV-FR-007**: impedir duplicados bajo reintentos y concurrencia.
- **REV-FR-008**: consultar reseñas por `propertyId` con paginación acotada y orden estable.
- **REV-FR-009**: consultar reseñas propias con autorización por ownership.
- **REV-FR-010**: devolver DTOs cerrados sin datos privados de huésped o reserva.
- **REV-FR-011**: responder errores externos mediante Problem Details con códigos estables y `traceId`.
- **REV-FR-012**: no persistir una reseña cuando Bookings rechaza, no encuentra o no puede validar la estadía.

## 5. Requisitos no funcionales

- **REV-NFR-001 Seguridad**: JWT RS256, issuer/audience/kid/exp validados, roles y scopes de mínimo privilegio, DTOs cerrados y logs sin token, comentario completo ni PII innecesaria.
- **REV-NFR-002 Rendimiento**: consultas de reseñas demuestran p95 menor a 500 ms y menos de 1 % de errores inesperados en un dataset reproducible.
- **REV-NFR-003 Persistencia**: PostgreSQL propio, migraciones reproducibles y garantía de unicidad en base de datos.
- **REV-NFR-004 Portabilidad**: servicio, migración y PostgreSQL ejecutables mediante Docker Compose con Node 20.
- **REV-NFR-005 Observabilidad**: logs JSON, métricas, trazas y propagación de `traceId` hacia Bookings.
- **REV-NFR-006 Calidad**: lint, typecheck, build, contratos y pruebas verdes; cobertura global mínima del 70 % sin sustituir pruebas significativas.
- **REV-NFR-007 Disponibilidad**: live/readiness, timeouts hacia Bookings y shutdown ordenado; una caída externa no permite saltar validaciones.

## 6. Entidades conceptuales

- **Review**: reseña inmutable creada por una estadía completada; contiene identidad propia, referencias externas, puntuación, comentario y fecha de creación.
- **Rating**: valor entero de 1 a 5.
- **ReviewEligibility**: respuesta autoritativa y efímera de Bookings para `bookingId + guestId`; no se persiste como verdad independiente.
- **ReviewPage**: página estable de resultados con metadatos de paginación.

## 7. Reglas y supuestos de planificación

- La expresión singular de RQ-11 se concreta como una reseña por estadía/reserva. Cambiar esta cardinalidad requiere actualizar la especificación antes de implementar.
- El comentario forma parte de RQ-11 y se exige junto con la calificación; 2.000 caracteres es un límite técnico de protección y contrato.
- No existen edición, eliminación, moderación, respuestas del propietario, votos de utilidad ni anonimización configurable en este incremento.
- `GET /reviews/user/:id` se interpreta con mínimo privilegio como consulta propia; no se concede una capacidad administrativa nueva.
- Bookings define `COMPLETED` como el único estado elegible.

## 8. Dependencias y límites

- `bookings-service` es autoridad de estadía y debe entregar el endpoint interno de elegibilidad previsto en sus tareas T079–T088.
- El API Gateway debe enrutar las tres operaciones públicas y reenviar el bearer validado para operaciones de usuario.
- Reviews no consulta `bookings_db`, `users_db` ni `accommodations_db`.
- No hay dependencia runtime de Users o Accommodations en este incremento.
- El evento `booking.v1.completed` puede habilitar una proyección futura, pero no sustituye la validación REST de creación.
- No se incorpora Redis ni RabbitMQ sin una necesidad adicional aprobada.

## 9. Éxito del incremento

- RQ-11 queda demostrable de forma aislada contra un provider contractual de Bookings.
- La integración real solo se declara completa cuando Bookings implementa y verifica T079–T088 y se ejecuta el E2E conjunto.
- Las consultas por propiedad aportan evidencia parcial a RQ-06 sin absorber el detalle de alojamientos.
- Todos los criterios de seguridad, persistencia, contrato, Docker y pruebas aplicables quedan verificables.
