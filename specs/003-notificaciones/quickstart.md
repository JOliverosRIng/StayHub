# Quickstart de validación — notifications-service

Esta guía describe evidencia prevista para una implementación futura. No ejecuta ni instala el servicio en esta fase.

## Requisitos locales

- Node `>=20 <21`, npm y dependencias del servicio instaladas.
- PostgreSQL desechable solo para integración del repositorio, con base `notifications_db` y URL `NOTIFICATIONS_TEST_DATABASE_URL`.
- Pares RSA sintéticos de test para access y service JWT; no usar ni guardar claves reales.
- Ningún otro servicio, proveedor de correo ni acceso a internet requerido.

## Verificación del contrato

Desde la raíz, después de que exista la implementación/build del servicio:

```powershell
npm --prefix apps/notifications-service run build
node apps/notifications-service/scripts/validate-openapi.mjs
```

Esperado: el YAML pasa Swagger Parser y sus paths, parámetros, esquemas, seguridad y respuestas coinciden con el OpenAPI generado por la aplicación.

## Calidad por tarea NTF

Desde `apps/notifications-service`:

```powershell
npm test -- --runInBand
npm run lint
npm run typecheck
```

Cada tarea debe añadir y nombrar su prueba y terminar con los tres comandos limpios antes de su commit. `test:integration` requiere únicamente la base PostgreSQL aislada del propio servicio; las demás suites usan adaptadores/llaves sintéticos.

## Evidencia final esperada

- `npm run test:unit`, `test:integration`, `test:contract`, `test:security` sin llamadas a red ni a otros servicios.
- Casos de seguridad: bearer inválido, RS256/kid/issuer/audience/exp inválidos, service scope incorrecto, rol no permitido y usuario leyendo UUID ajeno.
- Casos de envío: tres tipos, ambos canales, validación cerrada, fake email y no invocación externa, replay idempotente y conflicto de clave concurrente.
- Casos de consulta: orden/cursor/filtros/límite, dueño/admin y ausencia de datos internos.
- Inspección de salida de logs: ningún token, email, idempotency key, subject o body.
- Arranque escuchando `3009` con su configuración y base propia, sin iniciar Users/Auth/Bookings/Payments/Gateway.

La incorporación del servicio a Docker Compose/Gateway es coordinación de plataforma pendiente; está fuera del alcance de archivos de esta feature.

