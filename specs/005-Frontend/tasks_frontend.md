---
description: "Tareas dependency-ordered exclusivas para el equipo Frontend — Sprint 2 (Alojamientos y búsqueda) y Sprint 3 (Reservas, pagos y reseñas)"
---

# Tasks: Frontend — Sprints 2 y 3 (apps/web)

**Input**: `tendencias.pdf` (requerimientos RQ-03–RQ-11, stack y entregables por sprint), la
constitución de StayHub, los contratos OpenAPI de `accommodations-service`, `search-service`,
`bookings-service`, `payments-service`, `reviews-service`, y el estado actual de `apps/web`.

**Scope**: Este backlog implementa exclusivamente el cliente web `apps/web` (React 18 + Vite +
TypeScript + Tailwind, pruebas con Vitest + Testing Library). Los microservicios de backend
aparecen solo como dependencias contractuales externas, consumidas a través del **API Gateway**
(`/api/v1`). No incluye lógica de negocio de backend, persistencia ni cambios en otros `apps/`.

**Format**: `- [ ] FE-### [P?] [RQ?] descripción (Component; Trace; Depends on) in path`

- `[P]` = puede ejecutarse en paralelo tras sus dependencias.
- `[RQ-03]`–`[RQ-11]` trazan los requisitos funcionales del documento.
- `External dependency` = exige que el Gateway exponga la ruta del servicio (tarea de backend G1);
  hasta entonces se desarrolla contra el contrato con mock de red (MSW) y se conecta al integrar.

> Nota SDD: idealmente Sprint 2 y Sprint 3 son dos *features* nuevas (p. ej. `002-alojamientos-busqueda`
> y `003-reservas-pagos`), cada una con su `spec.md`/`plan.md`. Este archivo agrupa el corte de
> frontend por equipo, siguiendo la convención de un archivo de tareas por grupo del proyecto
> (`tasks_apigateway.md`, `tasks_userService.md`, …).

---

## SPRINT 2 — Alojamientos y búsqueda (Frontend)

### Phase 1: Setup y fundamentos del frontend

- [x] FE-001 Introducir React Router y migrar la navegación: reemplazar el state machine (`type Page` en `App.tsx`) por un árbol de rutas públicas (`/`, `/login`, `/register`, `/search`, `/property/:id`), de huésped (`/bookings`) y de propietario (`/host`, `/host/new`), conservando `AuthContext` y el retorno tras login (Component: Routing; Trace: RQ-03–RQ-06, NFR Mantenibilidad; Depends on: none) in `apps/web/src/app/routes.tsx`, `apps/web/src/app/App.tsx` and `apps/web/src/main.tsx`
- [x] FE-002 [P] Configurar capa de datos: Axios + React Query con `QueryClientProvider`, cliente HTTP con `baseURL` al Gateway `/api/v1`, inyección del bearer desde la sesión existente y manejo 401→refresh/logout (Component: Data layer; Trace: NFR Comunicación/Seguridad; Depends on: none) in `apps/web/src/api/http.ts`, `apps/web/src/api/queryClient.ts` and `apps/web/src/app/App.tsx`
- [x] FE-003 [P] Definir tipos/contratos de transporte del frontend para `Property`, `Room`, `Photo`, `SearchResult`, `Review`, alineados a los OpenAPI de accommodations/search/reviews (Component: Contracts; Trace: RQ-04/RQ-06, Constitution VII; Depends on: none) in `apps/web/src/types/catalog.ts`
- [x] FE-004 [P] Configurar MSW (mock de red) para desarrollar contra los contratos mientras el Gateway no exponga properties/search/bookings (Component: Dev/test harness; Trace: Plan integración; Depends on: FE-002) in `apps/web/test/msw/handlers.ts` and `apps/web/test/setup.ts`
- [x] FE-005 [P] Variables de entorno (`VITE_API_BASE_URL`) y build/preview sin secretos; fallo claro si falta la base URL en producción (Component: Config; Trace: NFR Portabilidad; Depends on: FE-002) in `apps/web/.env.example` and `apps/web/vite.config.ts`

**Checkpoint**: el frontend compila, enruta y tiene capa de datos lista, sin consumir aún servicios reales.

### Phase 2: RQ-04 — Buscar propiedad

**Independent Test**: con MSW/stub de search, la vista aplica filtros (ubicación, precio, fechas, capacidad, amenidades, keywords) y muestra resultados ordenados por relevancia.

- [x] FE-006 [P] [RQ-04] Escribir primero pruebas del cliente de búsqueda (`GET /search` con filtros, `GET /search/suggest`) y mapeo de errores (Component: Search client tests; Trace: RQ-04; Depends on: FE-003–FE-004) in `apps/web/src/api/search.test.ts`
- [x] FE-007 [P] [RQ-04] Escribir primero pruebas de la vista de búsqueda: filtros, estados vacío/carga/error y orden por relevancia (Component: Search view tests; Trace: RQ-04; Depends on: FE-001) in `apps/web/src/pages/Search.test.tsx`
- [x] FE-008 [RQ-04] Implementar cliente de búsqueda con React Query (debounce de keywords, serialización de filtros, cancelación) (Component: Search client; Trace: RQ-04; Depends on: FE-006; External dependency: Gateway expone `/search`) in `apps/web/src/api/search.ts`
- [x] FE-009 [RQ-04] Implementar panel de filtros reutilizando `SearchBar` y `CategoryPills` existentes (Component: Search filters; Trace: RQ-04; Depends on: FE-007) in `apps/web/src/components/search/FiltersPanel.tsx` and `apps/web/src/components/home/SearchBar.tsx`
- [x] FE-010 [RQ-04] Implementar página de resultados con lista de `PropertyCard`, orden por relevancia, paginación/scroll y enlace a detalle (Component: Search results; Trace: RQ-04; Depends on: FE-008–FE-009) in `apps/web/src/pages/Search.tsx`
- [x] FE-011 [RQ-04] Sustituir `data/properties` mock por datos reales en Home/Search, conservando un fallback de desarrollo (Component: Wire real data; Trace: RQ-04; Depends on: FE-010) in `apps/web/src/pages/Home.tsx` and `apps/web/src/data/properties.ts`

### Phase 3: RQ-06 — Ver detalle de una propiedad

**Independent Test**: cualquier usuario abre la ficha completa de un alojamiento (fotos, descripción, precio, disponibilidad, reseñas y mapa).

- [x] FE-012 [P] [RQ-06] Escribir primero pruebas del cliente de propiedad (`GET /properties/:id`) y de reseñas (`GET /properties/:id/reviews`), incluido 404 (Component: Property client tests; Trace: RQ-06; Depends on: FE-003–FE-004) in `apps/web/src/api/properties.test.ts`
- [x] FE-013 [RQ-06] Implementar clientes de propiedad y reseñas con React Query (Component: Property client; Trace: RQ-06; Depends on: FE-012; External dependency: Gateway expone `/properties`) in `apps/web/src/api/properties.ts` and `apps/web/src/api/reviews.ts`
- [x] FE-014 [RQ-06] Reemplazar `PropertyDetail` mock por la ficha real: galería de fotos, descripción, precio, disponibilidad, reseñas y mapa de ubicación (Component: Property detail; Trace: RQ-06; Depends on: FE-013) in `apps/web/src/pages/PropertyDetail.tsx` and `apps/web/src/components/property/`
- [x] FE-015 [RQ-06] Estados de carga/no encontrado (404) y accesibilidad de la galería (teclado, alt text) (Component: Detail UX; Trace: RQ-06, NFR; Depends on: FE-014) in `apps/web/src/pages/PropertyDetail.tsx`

### Phase 4: RQ-05 — Publicar propiedad

**Independent Test**: un propietario autenticado crea una propiedad con habitaciones, precios, características y fotos; queda visible tras validación básica.

- [x] FE-016 [P] [RQ-05] Escribir primero pruebas del cliente de creación (`POST /properties`, `POST /properties/:id/photos`) incluyendo tipo/límite de foto y errores (Component: Create client tests; Trace: RQ-05; Depends on: FE-003–FE-004) in `apps/web/src/api/properties-write.test.ts`
- [x] FE-017 [P] [RQ-05] Escribir primero pruebas del formulario de publicación: validación de campos, habitaciones dinámicas, carga de fotos y envío (Component: Publish form tests; Trace: RQ-05; Depends on: FE-001) in `apps/web/src/pages/host/PublishProperty.test.tsx`
- [x] FE-018 [RQ-05] Implementar cliente de escritura de propiedades y subida de fotos (multipart) con React Query mutations (Component: Create client; Trace: RQ-05; Depends on: FE-016; External dependency: Gateway expone `/properties`) in `apps/web/src/api/properties.ts`
- [x] FE-019 [RQ-05] Implementar formulario de publicación (datos, habitaciones, precios, características, fotos) con validación (Component: Publish form; Trace: RQ-05; Depends on: FE-017–FE-018) in `apps/web/src/pages/host/PublishProperty.tsx` and `apps/web/src/components/host/`
- [x] FE-020 [RQ-05] Proteger `/host/new` para rol `OWNER`; redirigir a huésped/no autenticado con mensaje (Component: Owner guard; Trace: RQ-05, Seguridad; Depends on: FE-001, FE-019) in `apps/web/src/app/RequireRole.tsx`

### Phase 5: RQ-03 — Editar propiedad

**Independent Test**: el propietario modifica nombre, descripción, precios, características, fotos y disponibilidad de una propiedad propia.

- [x] FE-021 [P] [RQ-03] Escribir primero pruebas del cliente de edición (`PUT /properties/:id`) y de la precarga del formulario (Component: Edit client tests; Trace: RQ-03; Depends on: FE-016) in `apps/web/src/api/properties-edit.test.ts`
- [x] FE-022 [RQ-03] Implementar edición: reutilizar el formulario de publicación en modo edición con datos precargados y guardado (Component: Edit property; Trace: RQ-03; Depends on: FE-019, FE-021) in `apps/web/src/pages/host/EditProperty.tsx`
- [x] FE-023 [RQ-03] Vista "mis propiedades" del propietario con enlaces a editar (Component: Owner listings; Trace: RQ-03; Depends on: FE-013, FE-022) in `apps/web/src/pages/host/MyProperties.tsx`

### Phase 6: Integración y cierre Sprint 2

- [x] FE-024 [P] Guards de navegación por rol (público/huésped/propietario) y manejo global de 401/403 con toasts no intrusivos (Component: Authz UX; Trace: Seguridad; Depends on: FE-020) in `apps/web/src/app/routes.tsx` and `apps/web/src/components/ui/Toast.tsx`
- [x] FE-025 E2E de navegación buscar→detalle→publicar/editar con MSW y, si el Gateway ya expone las rutas, contra el entorno real (Component: Sprint 2 E2E; Trace: RQ-03–RQ-06; Depends on: FE-011, FE-015, FE-023) in `apps/web/test/e2e/catalog.e2e.test.tsx`
- [x] FE-026 Verificación Sprint 2: typecheck, lint, cobertura, accesibilidad básica y percepción de latencia <500 ms en búsqueda; registrar evidencia (Component: Sprint 2 DoD; Trace: NFR; Depends on: FE-006–FE-025) in `apps/web` and `specs/validation-report-frontend.md`

**Checkpoint**: huésped busca con filtros y ve detalle; propietario publica y edita. Cierra el frontend de Sprint 2.

---

## SPRINT 3 — Reservas, pagos y reseñas (Frontend)

### Phase 7: RQ-07 — Reservar una propiedad

**Independent Test**: un huésped autenticado selecciona fechas y habitación, ve el total y confirma; se genera la orden de pago.

- [x] FE-027 [P] [RQ-07] Escribir primero pruebas del cliente de reservas (`POST /bookings`, `GET /bookings/:id`) y de verificación de disponibilidad (Component: Booking client tests; Trace: RQ-07; Depends on: FE-002–FE-004) in `apps/web/src/api/bookings.test.ts`
- [x] FE-028 [P] [RQ-07] Escribir primero pruebas del flujo de reserva: selección de fechas sin solapamiento, cálculo de total y confirmación (Component: Booking flow tests; Trace: RQ-07; Depends on: FE-001) in `apps/web/src/pages/booking/Booking.test.tsx`
- [x] FE-029 [RQ-07] Implementar cliente de reservas con React Query (crear, consultar) (Component: Booking client; Trace: RQ-07; Depends on: FE-027; External dependency: Gateway expone `/bookings`) in `apps/web/src/api/bookings.ts`
- [x] FE-030 [RQ-07] Implementar flujo de reserva reutilizando `BookingContext`: fechas, habitación, cálculo de total y confirmación → orden de pago (Component: Booking flow; Trace: RQ-07; Depends on: FE-028–FE-029) in `apps/web/src/pages/booking/` and `apps/web/src/context/BookingContext.tsx`
- [x] FE-031 [RQ-07] Integrar pago (mock de pasarela): `POST /payments` y estado `GET /payments/:id/status` con resultados pagado/fallido y reintento (Component: Payment UI; Trace: RQ-07; Depends on: FE-030; External dependency: Gateway expone `/payments`) in `apps/web/src/api/payments.ts` and `apps/web/src/pages/booking/Payment.tsx`

### Phase 8: RQ-08 — Histórico de reservas

**Independent Test**: huésped y propietario consultan sus reservas con filtros por fecha, estado y huésped.

- [x] FE-032 [P] [RQ-08] Escribir primero pruebas del cliente de historial (`GET /bookings/history`) con filtros (Component: History client tests; Trace: RQ-08; Depends on: FE-027) in `apps/web/src/api/bookings-history.test.ts`
- [x] FE-033 [RQ-08] Implementar `MyBookings` (huésped) e historial del propietario con filtros, reemplazando el mock (Component: Bookings history; Trace: RQ-08; Depends on: FE-029, FE-032) in `apps/web/src/pages/MyBookings.tsx` and `apps/web/src/pages/host/BookingsReceived.tsx`

### Phase 9: RQ-09 / RQ-10 — Cancelar reserva

**Independent Test**: el huésped cancela dentro de la política; el propietario cancela con justificación; se refleja el reembolso cuando aplica.

- [x] FE-034 [P] [RQ-09][RQ-10] Escribir primero pruebas de cancelación (`DELETE /bookings/:id`) para huésped (política) y propietario (justificación) y de los estados de reembolso (Component: Cancel tests; Trace: RQ-09/RQ-10; Depends on: FE-032) in `apps/web/src/api/bookings-cancel.test.ts`
- [x] FE-035 [RQ-09][RQ-10] Implementar cancelación con confirmación, mostrando la política aplicable y el resultado del reembolso (Component: Cancel flow; Trace: RQ-09/RQ-10; Depends on: FE-033, FE-034) in `apps/web/src/pages/booking/CancelBooking.tsx`

### Phase 10: RQ-11 — Calificar la propiedad

**Independent Test**: tras una estadía completada, el huésped deja 1–5 estrellas y un comentario sobre la propiedad.

- [x] FE-036 [P] [RQ-11] Escribir primero pruebas del cliente de reseñas (`POST /reviews`, `GET /reviews/user/:id`) y de la condición "estadía completada" (Component: Review tests; Trace: RQ-11; Depends on: FE-012) in `apps/web/src/api/reviews-write.test.ts`
- [x] FE-037 [RQ-11] Implementar la vista Calificar propiedad (estrellas + comentario) habilitada solo tras estadía completada (Component: Review form; Trace: RQ-11; Depends on: FE-033, FE-036; External dependency: Gateway expone `/reviews`) in `apps/web/src/pages/booking/ReviewProperty.tsx`
- [ ] FE-038 [RQ-11] Mostrar reseñas del usuario y reflejar la nueva reseña en el detalle de la propiedad (Component: Review display; Trace: RQ-11, RQ-06; Depends on: FE-014, FE-037) in `apps/web/src/pages/PropertyDetail.tsx`

### Phase 11: Integración y cierre Sprint 3

- [ ] FE-039 E2E del flujo completo reservar→pagar→confirmar→(cancelar)→calificar con MSW y, si aplica, contra el entorno real (Component: Sprint 3 E2E; Trace: RQ-07–RQ-11; Depends on: FE-031, FE-035, FE-038) in `apps/web/test/e2e/booking.e2e.test.tsx`
- [ ] FE-040 Verificación Sprint 3: typecheck, lint, cobertura, accesibilidad y manejo de errores de pago/cancelación; actualizar el reporte (Component: Sprint 3 DoD; Trace: NFR; Depends on: FE-027–FE-039) in `apps/web` and `specs/validation-report-frontend.md`

**Checkpoint**: huésped reserva, paga, consulta historial, cancela según política y califica tras la estadía. Cierra el frontend de Sprint 3.

---

## Dependencies & Parallelization

- Phase 1 (FE-001–FE-005) bloquea todo lo demás. FE-002/003/004/005 son paralelas entre sí.
- Dentro de cada RQ, los tests `[P]` (…test.ts/.tsx) se escriben primero y en paralelo; la
  implementación los pone en verde.
- Sprint 2: RQ-04, RQ-06, RQ-05 y RQ-03 pueden repartirse tras la Phase 1; RQ-03 (editar) reutiliza
  el formulario de RQ-05 (publicar), así que va después.
- Sprint 3 depende de que el detalle de propiedad (RQ-06) exista; RQ-08/09/10/11 dependen del flujo
  de reserva (RQ-07).
- Las suites con MSW no esperan al backend; las tareas `External dependency` requieren que el
  Gateway (G1) exponga la ruta del servicio antes de conectar contra el entorno real (FE-025, FE-039).
- Dos personas pueden dividir "clientes/estado" vs "vistas/componentes" y converger en las tareas de
  integración de cada sprint.

## Definition of Done

- Sprint 2: huésped busca con filtros y ve el detalle completo; propietario publica y edita con
  fotos; rutas protegidas por rol; búsqueda percibida <500 ms.
- Sprint 3: huésped reserva, paga (mock), recibe confirmación, ve su historial, cancela según
  política y califica tras la estadía.
- Todo consume el backend a través del Gateway (`/api/v1`) con el bearer de la sesión; nada de
  credenciales ni secretos en el cliente.
- Pruebas (unidad de clientes, componentes y E2E con MSW) en verde; typecheck y lint limpios;
  cobertura según el umbral del proyecto.
- Cada FE-### cierra solo cuando su comportamiento está demostrado (no por existir un archivo), con
  su casilla `[x]` y commit trazable al RQ.
