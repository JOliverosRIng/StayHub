# Task 08 — Verificación final y documentación — Resultado

Estado: COMPLETA (los checks de cierre de integración Auth↔Users están acreditados; los pendientes
de Gateway, revisión humana y CI remota quedan fuera de alcance y abiertos, ver §5)

Fecha: 2026-09-30
Commit base: `08968e8` (rama `main`). Sin commits ni push.
Versiones: Node `v22.22.2`, npm `10.9.7` (el proyecto declara `>=20 <21`; solo avisos de engines).
Prisma `6.19.0`. Engine `podman` 5.8.7 + `podman-compose`; no se ejecutó `docker`. Imágenes
`postgres:16-alpine`, `redis:7-alpine`. No se imprimieron secretos ni tokens.

## 1. Dependencias leídas y estado comprobado

- `CONTEXTO.md`, el índice, `task-08/PLAN.md` y `task-01`–`task-07/resultado.md`. Las siete filas
  estaban en COMPLETA en el índice.
- Diff acumulado: 30 archivos rastreados modificados y 20 rutas nuevas sin rastrear. Además,
  `agents/`, `guia/`, `guia-v2/` e `integracion.sh` son trabajo del usuario y no se tocaron.

## 2. Archivos cambiados en esta tarea y decisiones

No cambió código productivo ni de pruebas. Se actualizó solo documentación:

| Archivo | Cambio |
|---|---|
| `apps/auth-service/README.md` | Tabla de las 9 suites de `test:auth-users`, utilidades del harness (proxy de fallos, ciclo de vida), recompilar `dist`, reintentos, compensación con ausencia confirmada, límite de la identidad PENDING huérfana y variables de las suites ordinarias |
| `apps/users-service/README.md` | Integración con Auth verificada sin Gateway y lo que sigue dependiendo de Gateway |
| `docs/dev-swagger.md` | Corrige dos textos obsoletos (el flag `--service-container` mencionaba el stub; la limpieza en contenedor decía que borraba el volumen) y añade la verificación registrada |
| `agents/contrato-users-candidato.md` | Estado «implementado y verificado técnicamente», con la revisión G2/G1 aún pendiente; §9 con contrato real, diferencia `400` y evidencia |
| `agents/result/README.md` | Enlace al resultado global; bloqueos antiguos actualizados (GET hecho, podman verificado, provider Users resuelto) sin borrar la historia |
| `apps/users-service/REVALIDACION.md` | Sección «Integración Auth↔Users»: evidencia nueva y estado de USR-071–078 frente a los bloqueos antiguos |
| `specs/.../tasks.md`, `tasks/tasks_authService.md`, `tasks/tasks_userService.md` | Se marcan **AUTH-077, AUTH-080 y USR-072**, con nota de evidencia. Se añaden notas sin marcar a AUTH-076, AUTH-079, USR-071, USR-073 y USR-077 |

Criterio de marcado: solo tareas cuyo texto completo quedó acreditado por esta ejecución.
- AUTH-076, AUTH-079 y USR-071 siguen abiertas porque exigen un *timeout* contra Users real, que
  solo se probó con el doble de Users. AUTH-079 además exige Compose, y el harness usa procesos
  Node. AUTH-076 también requiere la aceptación contractual de G2.
- Siguen sin marcar, como indica el plan: USR-073, USR-077, AUTH-078, AUTH-081, USR-074–076,
  USR-078, AUTH-084 y el cierre global.

## 3. Comandos, códigos de salida y resultados reales

| Comando (raíz) | Exit | Resultado |
|---|---|---|
| `npm run prisma:auth:generate` | 0 | cliente generado |
| `npm run prisma:users:generate` | 0 | cliente generado |
| `npm run typecheck` | 0 | Auth y Users |
| `npm run lint` | 0 | Auth y Users (repetido tras la documentación: 0) |
| `npm run build` | 0 | Auth y Users |
| `npm run test:users` | 0 | 24 suites, **169 tests** |
| `npm run test:auth` | 0 | 40 suites, **454 tests** |
| `npm run openapi:auth:check` | 0 | 11 tests |
| `node scripts/validate-users-openapi.mjs` | 0 | «valid, generated paths/schemas/security match versioned contract» |
| `npm run test:auth-users` | 0 | 9 suites, **38 tests**, 234 s |

Las suites completas se ejecutaron contra `stayhub-task08-*`, recursos desechables creados para esta
verificación y eliminados al terminar:
- `TEST_AUTH_DATABASE_URL`: PostgreSQL 16 `auth_test`, migrado.
- `TEST_AUTH_REDIS_URL`: Redis DB 15.
- `AUTH_TEST_ALLOW_CLEANUP=true`.
- `USERS_TEST_DATABASE_URL`: PostgreSQL 16 `users_db`.

Cobertura (`jest --coverage`; ambos workspaces tienen umbral global del 70 %, cumplido):

| Ámbito | Sentencias | Ramas | Funciones | Líneas |
|---|---|---|---|---|
| Auth global | 88.81 | 74.06 | 88.69 | 90.03 |
| Users global | 96.27 | 90.80 | 95.48 | 97.93 |
| Auth `reconcile-registrations.use-case.ts` (modificado en task-07) | 92.96 | 86.95 | 100 | 94.21 |
| Auth `users-registration.client.ts` | 92.98 | 87.87 | 100 | 98.03 |
| Auth `users-login-identity.client.ts` / `users-service.client.ts` / `users-service-token.provider.ts` | 100 / 100 / 100 | 100 / 89.47 / 100 | 100 | 100 |
| Users `get-registration.use-case.ts`, `registration.controller.ts`, `registration.openapi.ts`, `openapi.factory.ts`, `registration-state.module.ts` | 100 | 100 | 100 | 100 |
| Users `prisma/user.repository.ts` | 97.05 | 100 | 100 | 96.15 |

Nota: en ramas, `advance-registration.service.ts` (57.69) y `register-account.use-case.ts` (62.5)
quedan por debajo del 70 %. La integración no modificó esos archivos; su cobertura se mide aquí solo
con los tests unitarios e integración de Auth, porque las suites Auth↔Users se ejecutan sobre `dist`
en otro proceso y no suman cobertura. El umbral del proyecto es global y se cumple.

## 4. Verificación de los comandos de desarrollo

Recorrido con un script temporal que firmó su propio service JWT desde `secrets/gateway-private.pem`
sin imprimirlo. Se usaron identidades `task08-*@example.test`.

| Paso | `npm run dev:swagger` (nativo) | `npm run dev:swagger:docker` |
|---|---|---|
| Arranque | readiness 200/200 en unos 16 s; migraciones aplicadas | build de imágenes; `auth-migrate` y `users-migrate` exit 0; `users-service` healthy antes de `auth-service`; readiness 200/200 |
| `/docs` Auth y Users | 200 / 200 | 200 / 200 |
| Registro → login | 201 → 200, mismo `userId` | 201 → 200, mismo `userId` |
| Perfil GET / PATCH multipart | 200 / 200 (`version` 2) | 200 / 200 (`version` 2) |
| Perfil ajeno / service JWT en perfil | 403 / 401 | 403 / 401 |
| `users-stub` | 0 procesos y 0 contenedores | 0 contenedores |
| Parada (SIGINT, equivale a Ctrl+C) | 0 procesos Node, contenedores de dependencias retirados (`--down-deps`) y volúmenes `stayhub-auth-users-dev_*` conservados | 0 contenedores, volúmenes `stayhub-auth-dev_auth-db-data`/`_users_data` conservados y 0 temporales de secretos |
| Reinicio | login 200 con el mismo `userId`; perfil persistido (teléfono y versión) | ídem |
| Secretos | `sha256sum -c` de `.env` y `secrets/*`: sin cambios en todo el proceso | ídem |
| Puertos | 3001/3002 libres tras la parada | en marcha solo `127.0.0.1:3001` y `127.0.0.1:3002`; bases y Redis sin publicar |

Compose base: `podman-compose -f docker-compose.yml config` da exit 0 y ningún servicio declara
`ports` (`auth-db`, `auth-migrate`, `auth-redis`, `auth-service`, `users-db`, `users-migrate`,
`users-service`).

## 5. Checklist de cierre del plan

| Check | Estado | Evidencia |
|---|---|---|
| GET Users implementado y protegido; estados/errores verificados | OK | task-01; `registration.contract` y `service-auth` en `test:users`; `users-registration.consumer` |
| OpenAPI Users coincide con Swagger; contrato Auth compatible | OK | `validate-users-openapi.mjs` exit 0; `openapi:auth:check` 11/11; consumidores validan las respuestas reales contra el YAML |
| Auth usa Users real para registro y login | OK | INT-01–08 y los dos comandos de desarrollo sin stub |
| Users acepta el JWT de login real y conserva ownership | OK | INT-09–11; recorridos de desarrollo (403 ajeno) |
| JWT de servicio y de usuario con claves y usos separados | OK | INT-16; token de servicio en perfil 401; access JWT como token de servicio 401; `service-trust.spec.ts` |
| Ambos comandos de desarrollo sin Users simulado | OK | §4 |
| Reinicio conserva usuarios y configuración criptográfica | OK | §4 e INT-17 |
| Pruebas reales Auth↔Users sin Gateway | OK | `test:auth-users` 38/38 |
| Recuperación ante pérdidas y registros interrumpidos | OK | INT-13–15 (task-07, repetido aquí) |
| Lint, tipos, builds, contratos, regresión y cobertura | OK | §3 |
| Documentación y resultado sin afirmar pruebas no ejecutadas | OK | §2; Gateway, G1/G2 y CI remota figuran como pendientes |

Pendientes reales, fuera del alcance de esta integración:
- Gateway: introspección de sesión antes del perfil, rutas públicas, HTTPS de borde y cookie
  (USR-073, USR-077, AUTH-078, AUTH-081).
- Revisión humana y contractual de G2/G1; CI remota (USR-074–076, USR-078, AUTH-084).
- Timeout literal contra Users real y verificación de la saga mediante Compose en lugar de procesos
  (AUTH-076, AUTH-079, USR-071).
- Node 20 exacto y `docker` sin probar en este host.

## 6. Recursos temporales y limpieza

- Creados y eliminados: `stayhub-task08-*-{auth-pg,users-pg,redis}` (`rm -f -v`); los entornos de
  `test:auth-users`; el script de recorrido, sus estados, logs, hashes, pid y cobertura en `/tmp`.
- Verificación final: 0 contenedores `stayhub-task08|stayhub-auth-users-test|stayhub-auth-dev|stayhub-auth-users-dev`
  en marcha; puertos 3001/3002 libres.
- Conservados sin tocar:
  - Volúmenes de desarrollo `stayhub-auth-users-dev_*` y `stayhub-auth-dev_*`, que ahora también
    contienen los usuarios sintéticos `task08-*@example.test`.
  - Recursos previos del usuario: `stayhub-auth-test-pg`, `stayhub-auth-test_*` y contenedores
    ajenos.
  - `.env` y `secrets/`: solo se leyeron.

## 7. Instrucciones para el siguiente trabajo (no ejecutado)

- Esta es la última tarea del plan. El resultado global está en `agents/integracion/resultado.md`.
- Para retomar la verificación: `npm run env:auth:dev` (solo si faltan `.env`/`secrets/`),
  `npm run build` y `npm run test:auth-users`, con el puerto 3002 libre y podman o docker
  disponibles.
- Siguiente trabajo natural: el Gateway (G1). Debe cubrir la introspección
  (`POST /internal/v1/sessions/validate` de Auth) antes de reenviar al perfil de Users, más AUTH-078
  y AUTH-081.
