# Notifications Service — Especificación

**Rama**: `feat/notifications-service`  
**Creado**: 2026-11-07  
**Estado**: Borrador para revisión  
**Fuente funcional**: `tendencias.md` (catálogo de servicios/rutas y Notificaciones de reserva), decisiones aprobadas en esta conversación y patrones de contratos existentes.  
**Servicio/puerto**: `notifications-service`, HTTP interno `3009`.

## Objetivo y límites

El servicio conserva y presenta notificaciones dirigidas a un usuario, y acepta solicitudes autenticadas para crear confirmaciones de reserva, recordatorios de check-in y alertas del sistema. Solo expone `POST /notifications/send` y `GET /notifications/user/{id}`. No programa recordatorios, no consume colas/eventos y no llama a otros servicios. La aplicación cliente que conoce el hecho (por ejemplo, una reserva confirmada) solicita el envío.

Se conservan notificaciones `IN_APP` y se pasa `EMAIL` por un adaptador local falso que no contacta redes externas. El contenido se genera dentro del servicio a partir de variables validadas por tipo; no se admiten plantillas editables ni envío de texto arbitrario de reserva.

## Trazabilidad

| Requisito | Fuente | Alcance |
|---|---|---|
| Confirmaciones de reserva, recordatorios de check-in y alertas | `tendencias.md`, catálogo de microservicios | `BOOKING_CONFIRMATION`, `CHECKIN_REMINDER`, `SYSTEM_ALERT` |
| Envío de notificación | `tendencias.md`, tabla de rutas | `POST /notifications/send` |
| Consulta de notificaciones de un usuario | `tendencias.md`, tabla de rutas | `GET /notifications/user/{id}` |
| Puerto 3009 | `tendencias.md`, tabla de servicios | Puerto interno del servicio |
| Aislamiento de datos, autenticación JWT, OpenAPI, pruebas y trazabilidad | `.specify/memory/constitution.md` | Se verifican en plan y tareas |

## Actores

- **Servicio llamador autenticado**: pide una notificación tras conocer el hecho de negocio. Se autentica con un service JWT de audiencia notifications y scope de envío exclusivo.
- **Administrador (`ADMIN`)**: puede enviar notificaciones usando un access JWT válido.
- **Usuario autenticado**: consulta solo sus notificaciones, identificándose con el `sub` del access JWT.
- **Administrador (`ADMIN`)**: puede consultar la colección de cualquier usuario.
- **Adaptador de correo local**: recibe la notificación sin entregarla fuera del proceso ni registrar sus contenidos.

El contrato no exige interacción directa con Users, Bookings, Auth u otro microservicio. Los identificadores de usuario son UUID como en Users. `bookingId` es una referencia externa opaca no vacía, compatible con el modelo de Booking de la aplicación web (`id` string); no se establece FK entre bases de datos.

## Historias de usuario

### US1 — Emitir una notificación idempotente (P1)

Como servicio llamador autenticado o administrador, quiero crear una notificación para comunicar un hecho de reserva o una alerta al usuario indicado.

**Prioridad**: Es el comportamiento central del servicio y satisface el envío del catálogo del proyecto.

**Prueba independiente**: enviar cada tipo y canal válido, comprobar contenido generado y registro persistido; repetir la misma clave conserva un solo registro.

**Criterios de aceptación**

1. `POST /notifications/send` rechaza solicitudes anónimas con `401`; acepta service JWT solo con el scope de envío configurado, o access JWT de `ADMIN`. Otros roles reciben `403`.
2. El cuerpo cerrado exige `userId`, `type`, `channel` y `templateData`; `EMAIL` requiere `recipientEmail`, `IN_APP` lo rechaza. Campos desconocidos producen `400 VALIDATION_ERROR`.
3. `BOOKING_CONFIRMATION` valida `bookingId`, `roomTitle`, `roomLocation`, `checkIn`, `checkOut`, `guests` y `totalPrice`; el servicio construye asunto/cuerpo. Fechas son ISO `YYYY-MM-DD`, huéspedes enteros positivos y precio decimal no negativo con hasta dos decimales.
4. `CHECKIN_REMINDER` valida `bookingId`, `roomTitle`, `roomLocation` y `checkIn`, con fecha ISO `YYYY-MM-DD`; el servicio construye asunto/cuerpo.
5. `SYSTEM_ALERT` valida `alertCode` (`[A-Z][A-Z0-9_]{1,63}`), `title` (1–120 caracteres) y `message` (1–2000 caracteres). Título y mensaje son el contenido proporcionado por el llamador autenticado; el servicio los coloca en una envoltura fija, sin inventar catálogos de alertas.
6. Toda solicitud lleva `Idempotency-Key` no vacía de 1–128 caracteres. Repetirla con contenido canónico idéntico devuelve la notificación existente; reutilizarla con contenido distinto devuelve `409 IDEMPOTENCY_CONFLICT`.
7. `IN_APP` queda `SENT` al persistirse. `EMAIL` solo queda `SENT` si el adaptador local falso acepta la operación; el estado no implica entrega de correo. Error del adaptador deja registro `FAILED` con `failureReason` seguro y sin contenido sensible en logs.
8. Una respuesta satisfactoria devuelve la representación persistida, sin secretos ni datos internos de persistencia.

### US2 — Consultar notificaciones propias (P1)

Como usuario autenticado, quiero consultar mis notificaciones recientes para revisar confirmaciones, recordatorios y alertas.

**Prueba independiente**: crear registros aislados, consultar como dueño, comprobar orden, filtros y límites, y verificar que no aparecen registros de terceros.

**Criterios de aceptación**

1. `GET /notifications/user/{id}` exige access JWT RS256 válido; service JWT no sirve como identidad de usuario.
2. El `sub` igual a `{id}` puede leer; un `ADMIN` puede leer cualquier `{id}`; otro usuario recibe `403`. ID UUID inválido produce `400`.
3. La página se ordena por `createdAt` descendente y `id` descendente como desempate. `limit` por defecto es 20, máximo 100; cursor opaco continúa desde el último elemento. Filtros opcionales `status` y `type` se validan estrictamente.
4. La respuesta no incluye correo destino, `failureReason`, clave de idempotencia ni contenido de notificaciones ajenas; el usuario dueño recibe su propio asunto/cuerpo.
5. Sin resultados devuelve una página vacía. Errores siguen el Problem Details de Users.

### US3 — Mantener el contrato y operar de forma segura (P1)

Como equipo integrador, quiero contrato HTTP, configuración, salud y pruebas locales para verificar el servicio sin levantar otros microservicios.

**Prueba independiente**: validar OpenAPI localmente, iniciar el servicio con configuración aislada y correr suites unit, integration, contract y security sin llamadas de red ni otros servicios.

**Criterios de aceptación**

1. El OpenAPI versionado documenta rutas, autenticación, DTOs, paginación, respuestas y errores y es validable con Swagger Parser local.
2. El servicio falla cerrado ante configuración ausente o JWT mal configurado, y escucha en puerto `3009`.
3. Las pruebas de autorización verifican que ningún usuario lea registros ajenos; logs de pruebas no contienen token, correo destino, asunto ni cuerpo.
4. Las suites usan adaptadores falsos y/o PostgreSQL de prueba propio, nunca una dependencia de Users, Bookings, Payments, Gateway, Auth, correo real ni internet.

## Requisitos funcionales

- **FR-001**: El servicio MUST ofrecer solo `POST /notifications/send` y `GET /notifications/user/{id}` en esta versión.
- **FR-002**: El envío MUST requerir service JWT con scope exclusivo de envío o access JWT con rol `ADMIN`; no habrá ruta pública.
- **FR-003**: La lectura MUST requerir access JWT; solo dueño y `ADMIN` pueden leer el ID solicitado.
- **FR-004**: El servicio MUST aceptar únicamente los tres tipos acordados y validar un esquema cerrado de `templateData` para cada uno.
- **FR-005**: `EMAIL` MUST requerir correo destino y pasar por puerto/adaptador local falso; `IN_APP` MUST persistirse sin invocar un proveedor externo.
- **FR-006**: El servicio MUST generar contenido de confirmación y recordatorio con sus campos de tipo. Para alerta, MUST envolver un código, título y mensaje validados en texto fijo.
- **FR-007**: Toda solicitud de envío MUST traer `Idempotency-Key`; mismo contenido produce replay del recurso y contenido distinto produce conflicto `409`.
- **FR-008**: El registro MUST conservar identificador, usuario, tipo, canal, asunto, cuerpo, estado, razón de fallo segura, clave de idempotencia y marcas de creación/envío.
- **FR-009**: La consulta MUST paginar con límite predeterminado 20 y máximo 100, orden temporal descendente con desempate estable, cursor y filtros estado/tipo.
- **FR-010**: Validación, errores y trazas MUST seguir el formato Problem Details de Users y rechazar propiedades no declaradas.
- **FR-011**: Ningún log MUST contener cuerpo/asunto, correo destino, token, clave de idempotencia u otro secreto de autenticación.
- **FR-012**: El servicio y sus pruebas MUST funcionar sin invocar otros servicios, proveedores reales, colas ni internet.
- **FR-013**: La API MUST tener OpenAPI versionado y validado localmente.
- **FR-014**: Cada tarea NTF tendrá criterios de aceptación, prueba nombrada, ejecución limpia de test/lint/typecheck y commit propio; no se hará push ni merge.

## Fuera de alcance

Scheduler o envío automático por tiempo; colas/eventos; llamadas a otros servicios; proveedores SMTP/SMS/push reales; preferencias; plantillas editables; reintentos automáticos; endpoints adicionales; cambios en gateway, Compose, raíz u otros servicios; push y merge.

## Casos límite

- Clave idempotente igual con contenido diferente; misma clave concurrente; error de persistencia durante creación.
- Campo ajeno, variable ausente, variable extra, fecha inválida, precio/huéspedes fuera de límite, email inválido y enum desconocido.
- Email ausente en `EMAIL` o incluido en `IN_APP`; adaptador local que falla.
- JWT expirado, algoritmo/kid/issuer/audience incorrectos, scope ausente/incorrecto, rol insuficiente, bearer duplicado o service JWT usado para GET.
- Lectura de usuario ajeno, UUID inválido, cursor corrupto, límite 0/sobre máximo, filtro inválido y página vacía.
- Mismo instante `createdAt` exige desempate consistente por `id`.

## Supuestos y decisiones fijadas

- Las aprobaciones de la Fase 1 definen autorización, campos persistidos, canales, tipos, idempotencia, paginación, persistencia y formato de errores.
- Los campos de reserva se derivan del contrato provisional `Booking` en `apps/web/src/types/index.ts`: `id`, `roomTitle`, `roomLocation`, `checkIn`, `checkOut`, `guests`, `totalPrice`; notificaciones solo toman los necesarios por tipo. Ese modelo web no constituye un contrato de Booking backend; `bookingId` se mantiene opaco y no se consulta otro servicio.
- Se siguen patrones Users: JWT RS256 local, claves públicas, env obligatoria, NestJS, repositorio/puerto, PostgreSQL/Prisma, Problem Details, OpenAPI, suites Jest por categoría y validación cerrada. La configuración propia de issuer/audience/kid/scope para este servicio será explícita.
- Plantillas de booking son texto fijo en español neutro generado por el servicio, con interpolación escapada y sin HTML. `SYSTEM_ALERT` acepta texto de operador/servicio autenticado y una etiqueta fija; no se inventa un catálogo de alertas.
- Persistir en `notifications_db` (base aislada) con Prisma/PostgreSQL. Se requiere URL local suministrada por entorno; Compose no se toca por la restricción de alcance.
- No hay contrato existente para Gateway ni emisor service JWT de notificaciones. La integración y provisión de credenciales fuera del servicio quedan como coordinación externa; este servicio valida la configuración y el scope acordados localmente.

## Criterios de éxito

- **SC-001**: Las dos rutas publicadas y sus esquemas/auth coinciden con el OpenAPI versionado, cuya validación local finaliza sin errores.
- **SC-002**: Un replay idéntico produce un solo registro; cualquier reutilización de clave con payload diferente se rechaza con 409.
- **SC-003**: En las pruebas de seguridad, ningún principal sin autorización obtiene una notificación ajena y ningún fallo de autenticación alcanza el repositorio.
- **SC-004**: Las pruebas locales pasan sin credenciales reales ni conectividad con microservicios/proveedores externos.
- **SC-005**: Ninguna evidencia de logs contiene tokens, correos, asuntos o cuerpos de notificación.

