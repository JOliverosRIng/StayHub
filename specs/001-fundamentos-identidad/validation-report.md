# Validación — Grupo 2: users-service

## Checkpoint y procedencia de la evidencia

Rama `feat/users-perfil-authz`; checkpoint conservado: `fb18495`.
Los siguientes resultados fueron **verificados por el usuario, no reejecutados**
en esta continuación (2026-09-29). No acreditan integración con Auth/Gateway ni
una ejecución remota de GitHub Actions.

| Comprobación del checkpoint | Resultado comunicado por el usuario |
|---|---|
| Lint y typecheck | Sin errores |
| Pruebas | 23 suites, 142 pruebas, todas verdes |
| Cobertura combinada | Sentencias 96,15%; ramas 89,95%; funciones 95,23%; líneas 98,05%; umbral 70% cumplido |
| Docker | Build multi-stage correcto; usuario `node`; healthcheck `/health/ready` |
| Compose | Configuración válida con variables de prueba; 3002 no publicado |
| Artefactos existentes | Dockerfile, Compose, CI, validador OpenAPI y migraciones `create_users`/`add_profile_photo` |
| USR-047 / P2028 | Resuelto usando `127.0.0.1` en USERS_TEST_DATABASE_URL en Windows/Docker Desktop; no se modifican timeouts ni el repositorio por este incidente |

## Trazabilidad de pruebas

La trazabilidad siguiente es **a nivel de archivo de prueba**, con el mapeo
proporcionado por el usuario; no es un análisis de cada `it()`.
Todas las rutas son relativas a `apps/users-service/test/`.

| Historia / checkpoint | Requisitos | Archivos de evidencia |
|---|---|---|
| US1 — USR-037 | RQ-02, FR-001 a FR-006 | `contract/registration.contract.spec.ts`; `unit/registration-policy.spec.ts`; `integration/registration-concurrency.spec.ts`; `integration/registration-state.spec.ts`; `security/service-auth.spec.ts` |
| US3 — USR-060 | RQ-01, FR-014 a FR-019, FR-023 | `contract/profile.contract.spec.ts`; `unit/profile-validation.spec.ts`; `integration/profile-update.spec.ts`; `integration/profile-photo.spec.ts`; `unit/photo-policy.spec.ts` |
| US4 — USR-070 | FR-020 a FR-024, SC-004 | `security/jwt-hardening.spec.ts`; `unit/profile-authorization.spec.ts`; `integration/profile-ownership.spec.ts`; `integration/profile-restricted-fields.spec.ts`; `unit/roles.spec.ts`; `security/secret-leakage.spec.ts` |

## Pendientes externos de G2

| USR | Estado | Parte Users existente | Falta / responsable |
|---|---|---|---|
| 071 | BLOQUEADA | Endpoints y pruebas de registro provider de US1 | G3: cliente/orquestador real, service JWT compatible, timeout/retry y registro coordinado |
| 072 | BLOQUEADA | Lookup ACTIVE y pruebas de identidad | G3: consumidor lookup y login genérico real con correo vigente |
| 073 | BLOQUEADA | Perfil, foto, bearer, ownership y pruebas directas Users | G1: routing, introspección con G3, stripping, forwarding, timeouts y streaming reales |
| 074 | PARCIAL | Contrato Users y validador de drift existentes | G1/G3: expectativas consumidor aprobadas y ejecución conjunta provider/consumer |
| 075 | PARCIAL | Compose de Users, base y job de migración | Verificar arranque real de estos tres servicios; G1 debe integrar red/readiness conjunta y completar 071–073 |
| 076 | PARCIAL | Validador OpenAPI, prueba de secretos y CI existentes | Revisar etapas; cierre conjunto condicionado por USR-074 |
| 077 | BLOQUEADA | Fixtures sintéticos y pruebas directas Users | G1 coordina E2E HTTPS; G3 entrega Auth operativo. No hay evidencia de flujo completo |
| 078 | PARCIAL | Evidencia local comunicada del checkpoint | Ejecución final, Compose, CI remota, revisión independiente y resultados coordinados G1/G3 |

## Validación final de esta continuación

Pendiente: se registrarán aquí los resultados realmente ejecutados una sola vez
al concluir los cambios, separándolos de las cifras comunicadas por el usuario.
