# Evidencia final — notifications-service

Rama: `feat/notifications-service`
Alcance: NTF-001–NTF-015 más automatización de reserva. El servicio expone `POST /notifications/send`, `POST /notifications/events/booking-confirmed` y `GET /notifications/user/{id}` en el puerto `3009`.

## Checkpoints por tarea

| NTF | Commit | Evidencia nombrada |
| --- | --- | --- |
| NTF-001 | `95dc888` | `test/unit/package-config.spec.ts`; tooling local, aliases y suites. |
| NTF-002 | `06df33d` | `test/unit/config.spec.ts`; puerto fijo, URL de base propia, access/service JWT y bootstrap. |
| NTF-003 | `aa0d7f6`, `ae1afa6` | `test/unit/http-adapters.spec.ts`, `test/security/secret-leakage.spec.ts`; Problem Details, trace ID, subject y mensajes libres redactados. |
| NTF-004 | `c670d2e` | `test/unit/notification-policy.spec.ts`; tres plantillas, estados y fingerprint. |
| NTF-005 | `60d0f22` | `test/unit/notification.repository.spec.ts`, `test/integration/notifications-persistence.spec.ts`; esquema PostgreSQL propio, unique global e índices. |
| NTF-006 | `9a20ea6`, `14edbe5` | `test/security/jwt-hardening.spec.ts`, `test/security/roles-guard.spec.ts`; RS256, claims sin duplicados, roles y scope. |
| NTF-007 | `da7517f` | `test/unit/fake-email.adapter.spec.ts`, `test/unit/in-app.adapter.spec.ts`; adaptadores sin proveedor externo. |
| NTF-008 | `2008ae3` | `test/unit/send-notification.use-case.spec.ts`; renderizado, persistencia y proyección pública. |
| NTF-009 | `217b866` | `test/contract/send-notification.contract.spec.ts`, `test/security/send-notification-authorization.spec.ts`; POST y autorización. |
| NTF-010 | `8f969dc` | `test/integration/notification-idempotency.spec.ts`; replay, conflicto y carrera determinista. |
| NTF-011 | `848e5db` | `test/unit/notification-cursor.spec.ts`, `test/integration/notification-listing.spec.ts`; cursor compuesto y aislamiento por `userId`. |
| NTF-012 | `a1b5b5a` | `test/contract/list-user-notifications.contract.spec.ts`, `test/security/notification-read-authorization.spec.ts`; ownership, filtros y `no-store`. |
| NTF-013 | `c28df11` | `test/contract/openapi.contract.spec.ts`; documento generado por Nest, YAML y validador local. |
| NTF-014 | `3bb406c` | `test/unit/config.spec.ts`; variables, `.env`, migración y límites locales documentados. |
| NTF-015 | este cierre | Suites independientes, lint, typecheck, build, OpenAPI y límites de evidencia registrados aquí. |

## Validación ejecutada

Desde `apps/notifications-service`, con Node 20:

| Comando | Resultado |
| --- | --- |
| `npm run test:unit` | PASS — 9 suites, 30 tests. |
| `npm run test:integration` | PASS — 3 suites, 3 tests deterministas. |
| `npm run test:contract` | PASS — 3 suites, 5 tests. |
| `npm run test:security` | PASS — 5 suites, 9 tests. |
| `npm run lint` | PASS. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS. |
| `node scripts/validate-openapi.mjs` | PASS — 2 operaciones aprobadas y esquemas de seguridad presentes. |

La suite de persistencia inspecciona el esquema y la migración; el test de idempotencia usa un repositorio en memoria para probar concurrencia. **No se ejecutó una integración contra PostgreSQL real.** No se configuró una base local ni se aplicaron migraciones en este ciclo.

## Seguridad y proyección

- El GET pasa el UUID autorizado al repositorio; el guard permite solo dueño o `ADMIN` con access JWT. Service JWT no sirve para leer.
- Las respuestas omiten email, razón de fallo, clave idempotente y fingerprint.
- Los logs estructurados redactan body, email, token, autorización, claves y fingerprint. Los errores de startup/storage no exponen valores internos.
- EMAIL es un fake sin sockets ni entrega real. No hay retry, queue, scheduler ni llamada a otro microservicio.

## Arranque y límites de evidencia

`POST /notifications/events/booking-confirmed` recibe un evento firmado por un service JWT, registra la confirmación en `IN_APP` y programa el recordatorio `IN_APP` 24 horas antes de `checkInAt` (o inmediatamente si queda menos tiempo). El worker durable consulta PostgreSQL cada 30 segundos; un `bookingId` solo puede tener una programación. Booking debe invocar esta ruta; este cambio no modifica ni conecta otro servicio.

Las alertas de sistema ya se crean mediante `POST /notifications/send` con `type: SYSTEM_ALERT`. EMAIL sigue usando el adaptador falso.

`npm run start:dev` y `npm start` cargan `.env`, validan configuración y escuchan `0.0.0.0:3009`. **La integración del worker contra PostgreSQL real aún debe verificarse** en el entorno local; requiere aplicar la migración nueva y configurar claves/issuer/audience sintéticos.

El despliegue en Compose, el wiring de Gateway y el aprovisionamiento de claves/scope de service JWT requieren coordinación de plataforma y quedan **fuera de alcance**, no PASS.
