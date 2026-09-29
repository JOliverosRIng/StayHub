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
| 074 | PARCIAL | Contrato y drift válidos; nueva suite `contract/users-provider.contract.spec.ts` y fixtures de entrega | G1/G3: expectativas consumidor aprobadas y ejecución conjunta provider/consumer |
| 075 | PARCIAL | Compose real verificado: migración exit 0 antes del servicio healthy, red interna y sin puertos publicados | G1 debe integrar red/readiness conjunta y completar 071–073 |
| 076 | PARCIAL | Validador OpenAPI, prueba de secretos y etapas CI revisados | Cierre conjunto condicionado por USR-074; CI remota no ejecutada |
| 077 | BLOQUEADA | Fixtures sintéticos y pruebas directas Users | G1 coordina E2E HTTPS; G3 entrega Auth operativo. No hay evidencia de flujo completo |
| 078 | PARCIAL | Evidencia local comunicada del checkpoint | Ejecución final, Compose, CI remota, revisión independiente y resultados coordinados G1/G3 |

## Revisión contractual y CI (ejecutada en esta continuación)

Comparación semántica de `66d539c` con `fb18495`: se conservan las nueve
operaciones, seguridad bearer/service JWT, enums y campos obligatorios de
requests/respuestas exitosas. Se conservan las adiciones 401/403 en operaciones
internas, 400/404 donde corresponden y 503 de indisponibilidad. Problem Details
exige ahora también `detail`, `instance` y `errors`, conforme a USR-012.
El cambio de referencias a esquemas inline no elimina restricciones.
No fue necesario revertir ni modificar el contrato. El validador
`node scripts/validate-users-openapi.mjs` terminó con exit 0: contrato válido,
paths/schemas/security coincidentes con Swagger generado.

El límite conservado es **5.000.000 bytes**. La expresión «5 MiB» encontrada en
documentación equivale a 5.242.880 bytes y es imprecisa; no cambia la regla ni se
modifican documentos fuera del alcance autorizado.

CI contiene instalación locked, Prisma generate/deploy, typecheck, lint,
cobertura unitaria, cobertura combinada, build, drift OpenAPI y Docker build.
USR-009/076 automatizan estos controles. La constitución exige 70% **unitario**;
el backlog habla de cobertura afectada. La cifra combinada del usuario no prueba
por sí sola el umbral unitario: CI conserva ambos controles y ningún umbral se
reduce. La revisión del YAML no acredita una ejecución remota de Actions.

## Compose real de G2

Proyecto aislado `stayhub-users-g2-validation`, secretos efímeros en el directorio
temporal del sistema **fuera del repositorio**. Primer intento exitoso, sin
reintentos. El build necesario para `compose up --build` ejecutó Prisma generate
6.19.0 y build TypeScript con éxito. No se recreó el PostgreSQL de pruebas existente.

- `users-db`: healthy, volumen propio y `5432/tcp: null` (sin publicación).
- `users-migrate`: exit 0; aplicó `202609280001_create_users` y
  `202609280002_add_profile_photo`; finalizó 2026-09-29 09:29:44.076930393 UTC.
- `users-service`: inició 09:29:44.377821607 UTC, después de la migración;
  healthy, usuario `node`, `3002/tcp: null`.
- Petición real dentro del contenedor a `/health/ready`: 200 `{"status":"ready"}`.
- Red `stayhub-users-g2-validation_internal`: `internal=true`.

Los contenedores de validación se mantienen disponibles. Los secretos temporales
deben conservarse mientras se utilice este proyecto. No hay collector real en
esta ejecución aislada: esto no acredita entrega OTLP ni integración G1/G3.
Durante `npm prune` el build informó 22 vulnerabilidades (1 baja, 13 moderadas,
8 altas). No se ejecutó una auditoría de alcanzabilidad ni se actualizaron las
versiones fijadas por Spec Kit; queda registrado para revisión de dependencias.

## Validación final de esta continuación

| Comando / control | Resultado real |
|---|---|
| `npm run typecheck:users` | Exit 0, una ejecución final |
| ESLint de los dos archivos TypeScript añadidos | Exit 0; lint completo anterior atribuido al usuario, no repetido |
| `npm run test:coverage --workspace @stayhub/users-service` | Una ejecución: 23 suites verdes, 1 fallida; 143 pruebas verdes, 1 fallida (24 suites/144 pruebas) |
| Corrección y ejecución dirigida de `users-provider.contract.spec.ts` | Exit 0: 1 suite, 2 pruebas verdes |
| Cobertura de la ejecución completa | 96,15% sentencias, 89,95% ramas, 95,23% funciones, 98,05% líneas; gate combinado 70% satisfecho |
| OpenAPI final | Exit 0; una ejecución final, además de la comprobación contractual inicial |
| Prisma generate / build | Exitosos dentro del build Compose requerido para el arranque |
| Migraciones reales | Las dos aplicadas mediante migrate deploy; exit 0 |
| Compose | Primer intento exitoso, Users healthy y readiness 200 |
| GitHub Actions remoto | No ejecutado; etapas revisadas, sin push |

Las 23 suites originales pasaron: 9 unitarias, 8 integration, 3 contract y
3 security. La única falla fue de la prueba provider **nueva**, que enviaba JSON
directo al PATCH multipart y recibía correctamente 415. Se corrigió la prueba
para usar el campo `profile`, sin tocar producción ni debilitar el contrato.
Se reejecutó solo esa suite: sus dos casos pasaron. No se repitió la suite
completa ni se presenta el primer comando como exitoso. La cobertura anterior
corresponde a esa ejecución completa, no a una segunda medición posterior.

## Alcance y auditoría de esta continuación

Se respetó la instrucción de revisión acotada: backlog Users, evidencia por
rutas, contrato Users (baseline/checkpoint), umbral de constitución, CI,
Docker/Compose, fixtures y adaptadores necesarios para la prueba nueva. No se
releyeron spec/plan/data-model completos ni suites existentes; se conservó su
auditoría previa. Arquitectura preservada: domain/application independientes,
puertos y adaptadores Prisma/HTTP, modules Nest, base exclusiva users_db.

Cambios nuevos: `.env.example`, README Windows, este reporte, estado raíz,
backlog Users y tres archivos de entrega provider. No cambian endpoints, DTO,
guards, repositorios, casos de uso, migraciones, Docker/Compose, CI ni telemetría
del checkpoint. El mapeo efectivo de errores permanece en `problem.filter.ts`
y `problem.mapper.ts`; los tres aliases sin consumidores se conservaron.

No se acredita retrospectivamente el orden red/green de pruebas preexistentes.
La nueva suite verifica funcionalidad existente y no requirió implementación
productiva. No se modificaron tasks.md, research.md, quickstart, checklists ni
contratos G1/G3. No existe `.specify/extensions.yml`: no hay hooks posteriores
que despachar. La tabla completa USR-001–078 está en `users-service-status.md`
en la raíz del repositorio.
