# Tasks: notifications-service

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [OpenAPI](contracts/openapi-notifications-service.yaml), [quickstart.md](quickstart.md).  
**Scope**: escribir únicamente dentro de `apps/notifications-service/` y `specs/003-notificaciones/`. No editar root, Compose, Gateway, otros servicios ni `.specify/`. No push/merge.

## Reglas por ciclo NTF

- Ejecutar **una NTF por ciclo**, solo tras la instrucción explícita `implementa NTF-###`; al acabar, reportar evidencia y esperar.
- Un test nuevo se escribe primero dentro de su tarea; el cambio de esa misma tarea debe dejarlo pasando antes de cerrarla.
- Cada tarea incluye criterios y un test nombrado. Al terminar cada una ejecutar desde `apps/notifications-service`: `npm test -- --runInBand`, `npm run lint`, `npm run typecheck`; reportar `git diff --stat` y resumen; hacer **un commit propio** `feat(notifications): NTF-### <descripción corta>`. No push.
- Ninguna tarea puede cambiar rutas aprobadas, proveedores externos, archivos compartidos o dependencias entre servicios.

## Fase 1: Setup

**Propósito**: crear un proyecto autónomo con paquetes/scripts locales y configuración testeable.

- [x] NTF-001 Crear `apps/notifications-service/package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.ts` y `eslint.config.mjs` con versiones/scripts acordes a Users, aliases `@notifications/*` y suites unit/integration/contract/security; incluir test `test/unit/package-config.spec.ts` que valida scripts y mapeo. **Aceptación**: `npm ci` local instala sin editar el package root; los scripts `test`, `test:unit`, `test:integration`, `test:contract`, `test:security`, `lint` y `typecheck` existen. **Prueba nombrada**: `test/unit/package-config.spec.ts`.
- [x] NTF-002 Crear configuración estricta y arranque HTTP en `apps/notifications-service/src/infrastructure/config/notifications-config.ts`, `src/infrastructure/config/config.module.ts`, `src/main.ts`, `src/app.module.ts`; ejemplo operativo y límites en `apps/notifications-service/.env.example` y `README.md`; test `test/unit/config.spec.ts`. **Aceptación**: puerto requerido exactamente 3009; valida URL `notifications_db`, JWT access/service RS256 con claves públicas de al menos 2048 bits, `kid`/issuer/audience/scope; access JWT máximo 3600 s y service JWT máximo 300 s según Users; bootstrap escucha 3009 sin otro servicio; errores de startup no imprimen secretos. Logs JSON seguros a stdout; no se exige Collector/OTLP para arrancar. No añade rutas adicionales. **Prueba nombrada**: `test/unit/config.spec.ts`.

## Fase 2: Fundación (bloquea historias)

**Propósito**: formato HTTP y adaptadores base que toda historia reutiliza.

- [x] NTF-003 Implementar filtro Problem Details, validación cerrada, trace ID y logger redactado en `apps/notifications-service/src/interfaces/http/` y `src/infrastructure/logging/`; crear pruebas `test/unit/http-adapters.spec.ts` y `test/security/secret-leakage.spec.ts`. **Aceptación**: errores tienen formato Users (`type/title/status/detail/instance/code/traceId/errors`); desconocidos producen 400; traces se propagan; capturas no serializan body/email/token/clave. **Prueba nombrada**: `test/unit/http-adapters.spec.ts` y `test/security/secret-leakage.spec.ts`.
- [x] NTF-004 Definir entidad, enums, errores y políticas de plantilla/fingerprint en `apps/notifications-service/src/domain/notifications/` y puertos en `src/application/ports/`; prueba `test/unit/notification-policy.spec.ts`. **Aceptación**: valida los tres esquemas exactos y límites de [data-model.md](data-model.md); renderiza texto fijo para bookings y envoltura de alerta, limpia/interpola texto plano, valida transición y calcula fingerprint canónico sin logging. **Prueba nombrada**: `test/unit/notification-policy.spec.ts`.
- [x] NTF-005 Crear esquema/migración Prisma, módulo/servicio Prisma y repositorio en `apps/notifications-service/prisma/` y `src/infrastructure/persistence/prisma/`; tests `test/unit/notification.repository.spec.ts` y `test/integration/notifications-persistence.spec.ts`. **Aceptación**: base propia notifications_db, unique global de idempotencyKey, requestFingerprint interno, índices para consulta por usuario/fecha/id, transacción/constraint ante concurrencia; no FK de Users ni llamada externa. **Prueba nombrada**: `test/unit/notification.repository.spec.ts` y `test/integration/notifications-persistence.spec.ts`.
- [x] NTF-006 Implementar verificación RS256 access/service y guards/roles/scope en `apps/notifications-service/src/infrastructure/security/` y `src/interfaces/http/auth/`, `src/interfaces/http/guards/`; pruebas `test/security/jwt-hardening.spec.ts`, `test/security/roles-guard.spec.ts`. **Aceptación**: allowlist RS256, `kid`, issuer/audience/iat/exp/max-age y claims UUID/rol; scope separado de send requerido solo a service JWT; access ADMIN habilita send, dueño/admin habilitan read; duplicado/malformado/expirado falla 401 y permiso/scope insuficiente 403 antes de repositorio. **Prueba nombrada**: `test/security/jwt-hardening.spec.ts` y `test/security/roles-guard.spec.ts`.

## Fase 3: US1 — Enviar notificación idempotente (P1)

**Objetivo**: crear notificaciones validadas, renderizadas, persistentes y seguras para ambos canales.

**Prueba independiente**: `npm run test:contract -- send-notification.contract.spec.ts` y `npm run test:integration -- send-notification.spec.ts` comprueban caminos válidos, replay y conflicto usando repositorio/adapter aislados.

- [x] NTF-007 [US1] Implementar puerto delivery y adaptadores EMAIL fake/IN_APP en `apps/notifications-service/src/infrastructure/delivery/` y tests `test/unit/fake-email.adapter.spec.ts`, `test/unit/in-app.adapter.spec.ts`. **Aceptación**: EMAIL no abre sockets ni registra contenido; admite resultado/razón finita; IN_APP no invoca delivery; ambos se enlazan mediante puerto. **Prueba nombrada**: `test/unit/fake-email.adapter.spec.ts` y `test/unit/in-app.adapter.spec.ts`.
- [x] NTF-008 [US1] Implementar `SendNotification` con creación de registro/status y resultado de delivery en `apps/notifications-service/src/application/notifications/send-notification.use-case.ts`; cubrir `test/unit/send-notification.use-case.spec.ts`. **Aceptación**: genera asunto/body desde políticas, IN_APP queda SENT al persistir, EMAIL queda SENT al aceptar fake o FAILED con código seguro; expone una representación sin email, fingerprint ni clave; falla cerrado ante storage. **Prueba nombrada**: `test/unit/send-notification.use-case.spec.ts`.
- [x] NTF-009 [US1] Implementar DTO discriminado, controlador `POST /notifications/send` y módulo en `apps/notifications-service/src/interfaces/http/notifications/` y `src/modules/notifications.module.ts`; escribir primero `test/contract/send-notification.contract.spec.ts` y `test/security/send-notification-authorization.spec.ts`. **Aceptación**: solo ruta aprobada; `Idempotency-Key` requerido; valida DTO cerrado, email condicional y autentica service-scope o ADMIN; 201 primera solicitud, respuestas Problem Details y antes de repo ante auth/validación. **Prueba nombrada**: `test/contract/send-notification.contract.spec.ts` y `test/security/send-notification-authorization.spec.ts`.
- [x] NTF-010 [US1] Completar replay idempotente global y conflicto ante clave con contenido distinto, incluyendo carrera, en `apps/notifications-service/src/infrastructure/persistence/prisma/notification.repository.ts` y `src/application/notifications/send-notification.use-case.ts`; test `test/integration/notification-idempotency.spec.ts`. **Aceptación**: mismo fingerprint devuelve recurso sin segundo delivery; fingerprint distinto da 409 `IDEMPOTENCY_CONFLICT`; dos envíos concurrentes con misma clave no duplican fila ni entrega; fallo storage se devuelve como 503 sin detalles internos. **Prueba nombrada**: `test/integration/notification-idempotency.spec.ts`.

## Fase 4: US2 — Consultar notificaciones propias (P1)

**Objetivo**: permitir historial paginado al dueño o ADMIN, sin filtrar datos internos ni registros ajenos.

**Prueba independiente**: `npm run test:security -- notification-read-authorization.spec.ts` verifica aislamiento; `npm run test:integration -- notification-listing.spec.ts` verifica cursor/filtros.

- [x] NTF-011 [US2] Implementar listado y cursor descendente en `apps/notifications-service/src/application/notifications/list-user-notifications.use-case.ts`, `src/infrastructure/persistence/prisma/notification.repository.ts` y `src/domain/notifications/notification-cursor.ts`; tests `test/unit/notification-cursor.spec.ts`, `test/integration/notification-listing.spec.ts`. **Aceptación**: default 20, max 100, status/type opcionales, `(createdAt,id)` descendente, cursor inválido 400, consulta siempre acotada al userId autorizado y proyección omite email/razón/clave/fingerprint. **Prueba nombrada**: `test/unit/notification-cursor.spec.ts` y `test/integration/notification-listing.spec.ts`.
- [x] NTF-012 [US2] Implementar DTO query/controlador `GET /notifications/user/{id}` en `apps/notifications-service/src/interfaces/http/notifications/`; escribir primero `test/contract/list-user-notifications.contract.spec.ts` y `test/security/notification-read-authorization.spec.ts`. **Aceptación**: solo ruta aprobada; access JWT válido, UUID válido, `sub=id` o ADMIN permitido, usuario ajeno 403, service JWT rechazado; limit/filtros estrictos y respuesta no-store paginada. **Prueba nombrada**: `test/contract/list-user-notifications.contract.spec.ts` y `test/security/notification-read-authorization.spec.ts`.

## Fase 5: US3 — Contrato y operación segura (P1)

**Objetivo**: documentar y verificar el comportamiento sin dependencias externas.

- [ ] NTF-013 [US3] Crear OpenAPI generado y módulo Swagger en `apps/notifications-service/src/interfaces/openapi/`; sincronizar `specs/003-notificaciones/contracts/openapi-notifications-service.yaml`; implementar `apps/notifications-service/scripts/validate-openapi.mjs`; pruebas `test/contract/openapi.contract.spec.ts`. **Aceptación**: Swagger Parser valida YAML y documento generado; paths, schemas, auth y respuestas coinciden; no se modifica validador compartido. **Prueba nombrada**: `test/contract/openapi.contract.spec.ts` y `node apps/notifications-service/scripts/validate-openapi.mjs`.
- [ ] NTF-014 [US3] Documentar variables, migración local, arranque 3009, suites y ausencia de integraciones reales en `apps/notifications-service/README.md` y `.env.example`; test `test/unit/config.spec.ts` ampliado. **Aceptación**: un desarrollador puede iniciar solo este proceso con base propia y configuración sintética, comprende variables `_FILE`, scopes, fake email y límites; no añade endpoint, Compose, ni credenciales reales. **Prueba nombrada**: `test/unit/config.spec.ts`.
- [ ] NTF-015 [US3] Generar evidencia final en `specs/003-notificaciones/quickstart.md` y cerrar estado de tareas en `specs/003-notificaciones/tasks.md` tras correr suites `unit`, `integration`, `contract`, `security`, lint, typecheck, build y validador OpenAPI. **Aceptación**: reporta por NTF el commit/evidencia disponible, pruebas por suite, seguridad de ownership/logs, arranque puerto 3009; todo lo que dependa de Compose/Gateway se marca fuera de alcance, no PASS. **Prueba nombrada**: suites Jest (`test:unit`, `test:integration`, `test:contract`, `test:security`) y `node apps/notifications-service/scripts/validate-openapi.mjs`.

## Dependencias y orden

```text
NTF-001 → NTF-002 → NTF-003 → NTF-004 → NTF-005 → NTF-006
                                                ├→ NTF-007 → NTF-008 → NTF-009 → NTF-010
                                                └→ NTF-011 → NTF-012
NTF-009 + NTF-012 → NTF-013 → NTF-014 → NTF-015
```

Aunque algunas tareas tocan archivos distintos, por decisión de trabajo cada NTF se ejecuta en un ciclo separado, con checkpoint humano posterior. Las historias US1 y US2 comparten auth/persistencia fundacional; US2 requiere el registro que introduce US1.

## Oportunidades paralelas identificadas

- NTF-003, NTF-004 podrían separarse por archivos tras NTF-002; no se paralelizan en ejecución por la regla de una NTF/ciclo.
- NTF-007 (adaptadores delivery) y NTF-011 (lógica de query/cursor) son potencialmente independientes después de NTF-006/005, aunque la secuencia aprobada los mantiene seriales.

## Estrategia de implementación

1. Completar setup/fundación NTF-001–006.
2. MVP: NTF-007–010 implementa envío persistente e idempotente, pero no se considera listo hasta proteger lecturas y validar contrato.
3. NTF-011–012 completa GET y ownership; verificar la suite de seguridad.
4. NTF-013–015 cierra OpenAPI, documentación y evidencia local.

## Validación de formato

- **Total**: 15 tareas `NTF-001`–`NTF-015`.
- **US1 envío**: 4 tareas; criterio independiente: POST produce/reproduce una fila y aplica auth.
- **US2 lectura**: 2 tareas; criterio independiente: dueño/admin consulta cursor y terceros reciben 403.
- **US3 operación/contrato**: 3 tareas; criterio: OpenAPI validado y runtime/tests documentados.
- Cada tarea tiene checkbox, ID NTF, paths exactos, criterios de aceptación y test nombrado; las tareas de historia llevan `[US1]`, `[US2]` o `[US3]`.
- Cada cierre incluye obligatoriamente test total, lint, typecheck y commit individual según Reglas por ciclo.
- **MVP sugerido**: NTF-001–010 habilita envío autenticado/idempotente; NTF-011–015 se requieren para completar la feature del contrato y evidencia final.

