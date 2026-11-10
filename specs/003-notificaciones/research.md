# Research decisions — notifications-service

**Feature**: [`spec.md`](spec.md)  
**Fecha**: 2026-11-07

## Decision: capas y módulos

- **Decisión**: reproducir la separación de `apps/users-service`: `domain`, `application/ports`, `application/use-cases`, `infrastructure` (config, seguridad, persistencia, logging), `interfaces/http` (DTO, controller, guards, mapper/filtro), módulos Nest, y `test/{unit,integration,contract,security}`.
- **Rationale**: es la referencia de mayor prioridad definida por el usuario y cumple la constitución de dependencia hacia adentro.
- **Alternativas**: copiar la estructura ligera de accommodations se descarta porque todavía no implementa auth/persistencia y el prompt da precedencia a Users.

## Decision: persistencia y concurrencia de idempotencia

- **Decisión**: PostgreSQL + Prisma en `notifications_db`, detrás del puerto `NotificationRepository`; clave idempotente única global. Guardar fingerprint SHA-256 del request normalizado como dato interno para distinguir replay/conflicto sin devolverlo. Restricción única de base de datos resuelve carreras.
- **Rationale**: coincide con Users/Constitución III, mantiene la base del servicio independiente y permite que una restricción única sea la autoridad ante concurrencia.
- **Alternativas**: memoria se descarta por pérdida entre reinicios; consultar otra base se descarta por aislamiento; comparar solo el contenido renderizado se descarta porque ocultaría cambios de destinatario o de `templateData` que producen el mismo texto.

## Decision: seguridad

- **Decisión**: repetir la verificación local de access JWT RS256 de Users (`kid`, issuer, audience, `iat`, `exp`, antigüedad máxima, claims UUID/rol) con claves públicas. Para POST admitir, en guard de ruta, service JWT con issuer/audience/kid públicos y scope exclusivo configurable, o access JWT ADMIN. GET solo acepta access JWT de dueño o ADMIN. No consultar Auth ni Gateway.
- **Rationale**: mantiene el modelo actual de servicios y hace que cada petición sea verificable sin dependencia de red.
- **Alternativas**: confiar en cabeceras de identidad o pedir introspección remota se descartan por spoofing/dependencia externa; reutilizar scope de Users se descarta por privilegio cruzado.
- **Pendiente fuera del artefacto**: Gateway/Auth deben provisionar una credencial service JWT adecuada para el scope configurado cuando exista un consumidor integrado. Este feature no crea esa integración.

## Decision: contenido de tipos de reserva

- **Decisión**: `BOOKING_CONFIRMATION` usa identificador opaco de reserva, título y ubicación de habitación, fechas, huéspedes y total; `CHECKIN_REMINDER` usa identificador, título/ubicación y fecha check-in. Los campos reflejan el tipo `Booking` provisional de `apps/web/src/types/index.ts`, sin depender de él en runtime. El bookingId admite string opaco acotado, no FK/UUID impuesto.
- **Rationale**: los datos ya aparecen en el frontend, mientras no existe `bookings-service` ni contrato de backend en el repo. Se limita la carga a información suficiente para mensajes útiles.
- **Alternativas**: asumir un esquema de Bookings backend no documentado se descarta; pedir una consulta a Bookings viola la decisión de cero dependencias.

## Decision: sistema de plantillas y canales

- **Decisión**: textos fijos en español neutro, interpolación de campos validados con escape de texto, nunca HTML. `SYSTEM_ALERT` conserva código, título y mensaje validados del llamador autenticado y los presenta en una envoltura fija. El adaptador local de email registra solo un resultado técnico sin contenido; `IN_APP` omite esa invocación.
- **Rationale**: concreta la aprobación de plantillas por tipo sin añadir un catálogo de alertas inexistente y respeta la regla de no enviar a Internet.
- **Alternativas**: texto libre para bookings, HTML, templates editables, SMTP/SMS/push real y códigos de alerta inventados quedan descartados.

## Decision: paginación y contrato

- **Decisión**: cursor opaco sobre el par `(createdAt,id)`, orden descendente, default 20/max 100; Problem Details compatible con Users; OpenAPI 3.0.3 en YAML y validador local con `@apidevtools/swagger-parser`.
- **Rationale**: el cursor preserva orden al insertar elementos, y el formato sigue la referencia prioritaria. Users ya trae parser y script de validación; accommodations no aporta implementación adicional de OpenAPI.
- **Alternativas**: offset pagination y respuestas de error ad hoc quedan descartadas.

## Constraints discovered

- `apps/notifications-service`, su runtime/DB en Compose, el route del Gateway y `specs/003-notificaciones` no existían.
- Las instrucciones prohíben modificar archivos compartidos; por tanto, este plan solo define artefactos de servicio y documenta la integración externa necesaria, sin añadir compose, Gateway, scripts raíz ni dependencias entre servicios.
- La ejecución de scripts Spec Kit se hizo con `-ExecutionPolicy Bypass` solo en el proceso; no se cambió la política del equipo.

