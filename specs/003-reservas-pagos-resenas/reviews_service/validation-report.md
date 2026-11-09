# Validation Report — reviews-service (Sprint 3)

**Fecha**: 2026-11-08  
**Alcance**: RQ-11 principal; contribución parcial a RQ-06.  
**Estado**: implementación de Reviews validada; cierre distribuido bloqueado por Gateway T070.

## 1. Tareas

| Rango | Estado | Nota |
|---|---|---|
| T001–T068 | Completadas | Setup, Foundation, US1–US3, Compose, CI y E2E aislado. |
| T069 | Completada | Consumer/provider y E2E real Reviews↔Bookings. |
| T070 | Bloqueada externamente | Gateway no tiene rutas ni cliente de Reviews. |
| T071–T074 | Completadas | Shutdown, quickstart, README y auditoría. |

## 2. Evidencia real ejecutada

Entorno: Node 22.22.2, npm 10.9.7, Docker 29.9.2/Compose 5.6.1 y PostgreSQL
16-alpine desechable. Las suites Prisma se ejecutaron en Node 22 Bookworm conectado a una base
aislada; el cliente Prisma compatible y la cobertura se escribieron en directorios temporales.

| Gate | Comando/escenario | Resultado |
|---|---|---|
| Estáticos | `npm run lint:reviews`, `npm run typecheck:reviews`, `npm run build:reviews` | exit 0 |
| Unit | `npm run test:reviews:unit` | 45 aprobadas |
| Contract | `npm run test:reviews:contract` | 45 aprobadas |
| Security | `npm run test:reviews:security` | 18 aprobadas |
| Integration | `npm run test:reviews:integration` | 22 aprobadas con PostgreSQL real |
| Concurrency | `npm run test:reviews:concurrency` | 1 aprobada; exactamente una fila por `bookingId` |
| Performance | `npm run test:reviews:performance` | 2 aprobadas; p95 <500 ms |
| E2E aislado | `npm run test:reviews:e2e` | 2 aprobadas; gates externos omitidos sin variables |
| E2E Bookings real | harness `bookings-reviews.e2e-spec.ts` | 1 aprobada; REST/JWT/DB separada |
| OpenAPI | `npm run openapi:reviews:check` | válido, 8 drift checks aprobados |
| Cobertura | `npm run test:reviews:coverage` | 135 aprobadas, 2 omitidas; 89.73/81.67/84.69/92.14 % |
| Compose | `docker compose --env-file .env.example config -q` | exit 0; warning por Redis de Gateway vacío |

Cobertura global: statements 89.73 %, branches 81.67 %, functions 84.69 % y lines 92.14 %;
todos los umbrales superan el 70 % constitucional.

## 3. Trazabilidad funcional

- **RQ-11 validado en Reviews**: bearer GUEST, elegibilidad autoritativa `COMPLETED`, derivación
  de `propertyId`, unicidad transaccional, fail-closed y ausencia de acceso a `bookings_db`.
- **RQ-06 parcial validado**: listado paginado y estable por propiedad, lista vacía válida y
  respuestas sin `guestId`/`bookingId`; la ficha completa sigue fuera del alcance de Reviews.
- **US3 validada**: historial propio con ownership previo a DB y sin capacidad ADMIN adicional.

## 4. Contratos, seguridad y operación

- Los dos OpenAPI 3.1 son válidos y el Swagger generado no presenta drift.
- Bookings `getReviewEligibility` conserva ruta, `guestId`, respuesta cerrada y handoff.
- T069 usó Bookings real con PostgreSQL propio, reserva `COMPLETED`, JWT RS256, audience
  `stayhub-bookings-service` y scope `reviews:eligibility`.
- Compose raíz/aislado, no-root, filesystem read-only, secrets por archivo, healthchecks y
  shutdown están representados y cubiertos por contrato/configuración.
- CI contiene los gates de Reviews; la ejecución remota completa y la revisión humana no se
  pueden acreditar desde esta sesión local.

## 5. Correcciones realizadas durante la validación

- Las pruebas de arquitectura ahora recorren archivos con `node:fs` y no dependen de ejecutar
  `rg` como subproceso, lo que las hace portables a runners restringidos.
- El harness real de Bookings acepta `REVIEWS_BOOKINGS_E2E_TOKEN_FILE`, coherente con el manejo
  de secretos por archivo y sin exponer JWT en argumentos o logs.

## 6. Pendiente antes de declarar Sprint 3 distribuido cerrado

1. Implementar en API Gateway las rutas públicas/privadas de Reviews, service JWT, ownership,
   rate limit y mapeo de Problem Details.
2. Ejecutar `gateway-reviews.e2e-spec.ts` y marcar T070 solo con evidencia real.
3. Obtener ejecución verde del pipeline remoto y revisión humana exigida por la constitución.

No se declara T070 ni integración distribuida completa a partir de un stub.
