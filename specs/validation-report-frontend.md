# Reporte de validación — Frontend (`apps/web`)

> Validación por sprint del cliente web. **Sprint 2 (FE-026, RQ-03–RQ-06)** a continuación; **Sprint 3 (FE-040, RQ-07–RQ-11)** al final del documento.

---

# Sprint 2 (FE-026 — RQ-03 a RQ-06)

**Tarea:** FE-026 (verificación del Sprint 2 — RQ-03 a RQ-06).
**Fecha:** 2026-11-10.
**Alcance:** cliente web `apps/web` (React 18 + Vite + TS + Tailwind; Vitest + Testing Library + MSW).
**Comandos de referencia:** `npm run -w @stayhub/web {test,typecheck,lint,test:coverage}`.

---

## 1. Resumen ejecutivo

**Estado: CUMPLE CON OBSERVACIONES.**

- ✅ Pruebas **190/190** en 19 archivos, **typecheck** y **lint** en verde (3 corridas estables).
- ✅ Accesibilidad básica revisada manualmente en las pantallas de Sprint 2; **1 hallazgo corregido** (nombre accesible del logo) y observaciones menores documentadas.
- ✅ Latencia **percibida** de búsqueda muy por debajo de 500 ms **con MSW** (debounce, caché y `keepPreviousData`); la latencia **real contra el Gateway queda PENDIENTE** (rutas aún no expuestas).
- ⚠️ Cobertura global **72.59 %** de líneas (sin umbral configurado en el proyecto). Las áreas del Sprint 2 están altas (`api/` 97.7 %, `pages/host/` 97.0 %, Search/Detail ~100 %); el global baja por archivos **fuera de alcance** (puntos de entrada, mocks de desarrollo, componentes legados/duplicados sin usar y `MyBookings` de Sprint 3).
- ⚠️ El listado "mis propiedades" (RQ-03) se sirve de un endpoint **provisional** mockeado (`GET /properties?mine=true`): el contrato de accommodations no expone listado por propietario (dependencia externa G1).

No se agregaron funcionalidades ni dependencias. El único cambio de código fue un arreglo mínimo de accesibilidad (ver §4).

---

## 2. Pruebas, typecheck y lint

| Verificación | Comando | Resultado |
|---|---|---|
| Pruebas unitarias/componentes/E2E | `npm run -w @stayhub/web test` | **19 archivos, 190 pruebas, 0 fallos** (estable en 3 corridas) |
| Tipos | `npm run -w @stayhub/web typecheck` (`tsc --noEmit`) | **0 errores** |
| Lint | `npm run -w @stayhub/web lint` (`eslint "src/**/*.{ts,tsx}"`) | **0 errores** |

Archivos de prueba que cubren Sprint 2 (no exhaustivo de conteos):
`src/api/search.test.ts`, `src/pages/Search.test.tsx`, `src/api/properties.test.ts` (13), `src/pages/PropertyDetail.test.tsx`, `src/api/properties-write.test.ts`, `src/pages/host/PublishProperty.test.tsx` (9), `src/api/properties-edit.test.ts` (9), `src/pages/host/MyProperties.test.tsx` (9), `src/app/RequireRole.test.tsx` (5), `src/components/ui/Toast.test.tsx` (8), `test/e2e/catalog.e2e.test.tsx` (7), `src/app/App.test.tsx` (12), `src/pages/Home.test.tsx` (7).

> Nota: `lint` solo cubre `src/**`; el E2E vive en `test/e2e/` y por tanto no se lintea, pero sí entra en `typecheck` (el `tsconfig` incluye `test`).

---

## 3. Cobertura

Proveedor presente: `@vitest/coverage-v8@2.1.9`; script `test:coverage` existente. **No se instaló nada.**

**Global (v8):** líneas/sentencias **72.59 %**, ramas **85.85 %**, funciones **82.09 %**.
El proyecto **no define umbral** de cobertura en `vitest.config.ts`.

| Directorio | Líneas | Ramas | Funciones |
|---|---|---|---|
| `src/api/` | **97.72 %** | 87.78 % | 97.89 % |
| `src/pages/` | 87.92 % | 86.09 % | 74.70 % |
| `src/pages/host/` | **96.95 %** | 84.68 % | 82.76 % |
| `src/app/` | 82.68 % | 79.25 % | 85.00 % |
| `src/components/` | 75.06 % | 85.22 % | 74.31 % |

**Archivos con menor cobertura (líneas %) y por qué (todos fuera del alcance funcional de Sprint 2):**

- `src/main.tsx`, `src/app/App.tsx` (0 %): puntos de entrada/cableado; no se montan en pruebas unitarias (el árbol se prueba vía `AppRoutes`).
- `src/mocks/browser.ts`, `public/mockServiceWorker.js` (0 %): worker MSW solo de desarrollo.
- `src/components/PropertyCard.tsx`, `src/components/home/HostCta.tsx`, `src/components/home/MapCta.tsx`, `src/components/layout/{Footer,Header,Logo}.tsx`, `src/components/property/PropertySection.tsx`, `src/components/ui/Button.tsx`, `src/data/rooms.ts` (0 %): componentes/datos **legados o duplicados sin uso** en las rutas de Sprint 2 (la tarjeta activa es `components/property/PropertyCard.tsx`, el header activo es `components/Header.tsx`, el botón activo es `components/Button.tsx`). Candidatos a limpieza, fuera del alcance de esta verificación.
- `src/pages/MyBookings.tsx` (19.42 %): pantalla de **Sprint 3** (reservas); aún placeholder.

**Resumen:** la cobertura del código efectivamente entregado en Sprint 2 (clientes de datos, Search, PropertyDetail, Publish/Edit/MyProperties, guards, toasts) es alta; el 72.59 % global está deprimido por archivos fuera de alcance.

### Observación de medición (no es un fallo de producto)
`npm run -w @stayhub/web test:coverage` tal cual **puede** fallar intermitentemente: bajo la instrumentación de v8 (más lenta) un caso parametrizado de `src/app/App.test.tsx` excede el `testTimeout` por defecto de 1000 ms. La suite normal (sin cobertura) es estable (190/190 en 3 corridas). La medición de esta sección se obtuvo con un **override puntual por CLI** `--testTimeout=30000` (sin modificar pruebas ni configuración comprometida). Recomendación (futura, no aplicada aquí para respetar "sin cambios de configuración global"): elevar `testTimeout` en `vitest.config.ts` para el perfil de cobertura.

---

## 4. Accesibilidad (revisión manual)

**No hay herramienta automática** de a11y instalada (`jest-axe`/`axe-core` ausentes). Por la regla de "no instalar dependencias", se hizo **revisión manual** con las utilidades existentes (roles/etiquetas de Testing Library), apoyada en las pruebas de cada pantalla.

**Hallazgo corregido (arreglo mínimo):**
- `components/Header.tsx` — el botón del logo mostraba la marca denominativa con `hidden sm:block` (`display:none`), que se excluye del árbol de accesibilidad, dejando al botón **sin nombre accesible en ancho móvil**. **Corregido** agregando `aria-label="StayHub, ir al inicio"`. Verificado: typecheck/lint/test siguen en verde.

**Estado por pantalla (OK = cumple):**

| Pantalla | Labels/errores | Nombre accesible botones/enlaces | Teclado/foco | Imágenes alt |
|---|---|---|---|---|
| Búsqueda (`Search`, `FiltersPanel`, `PropertyCard`) | OK — validación en región `role="alert"`; carga `role="status"` | OK — resultados `role="link"` con `aria-label="<nombre>, <ubicación>"` | OK — tarjeta operable con Tab/Enter/Espacio | OK — `img alt={title}`, placeholder "Sin foto" |
| Detalle (`PropertyDetail`, galería, mapa, reseñas) | OK — regiones `aria-label` | OK — botones "Ver foto N…", "Cerrar galería" | OK — diálogo de galería: foco al abrir, Escape devuelve el foco, flechas navegan | OK — `alt="<nombre>, foto N de M"`; iframe de mapa con `title` |
| Publicar (`PublishProperty` + `host/*`) | OK — `FormField` inyecta `aria-invalid` y `aria-describedby`; errores `role="alert"` | OK — botones "Publicar propiedad", "Guardar como borrador" | OK — fieldsets/legends; el resumen de error recibe foco al fallar el envío (patrón de gestión de foco, no robo) | n/a (fotos subidas listadas con nombre) |
| Editar (`EditProperty`) | OK — mismos `FormField`; error general `role="alert"` | OK — "Guardar cambios", "Cancelar" | OK — orden de foco coherente con el formulario de publicación reutilizado | n/a |
| Mis propiedades (`MyProperties`) | OK — lista `aria-label="Mis propiedades"`; carga `role="status"`; error `role="alert"` + "Reintentar" | OK — enlaces `aria-label="Editar <nombre>"`, "Ver" | OK | n/a |
| Login/Registro | OK — labels asociados (las pruebas usan `getByLabelText` de "Correo electrónico", "Contraseña", "Nombre completo", "Tipo de cuenta", "Confirmar contraseña") | OK — botones con texto | OK | n/a |
| Toasts globales (`Toast`) | OK — `role="alert"` (error) / `role="status"` (resto) | OK — botón "Cerrar" con `aria-label` | **OK — no roban el foco** (verificado en `Toast.test.tsx`), auto-descartan y se cierran manualmente | n/a |

**Observaciones menores (no bloqueantes, no corregidas para no cambiar funcionalidad):**
- `components/property/PropertyCard.tsx` usa `role="link"` sobre un `div` (operable por teclado y con `aria-label`), no un `<a href>` nativo: funcional y accesible, pero sin semántica de enlace real (no "abrir en pestaña nueva"). Candidato a mejora futura.
- Las migas de categorías usan `aria-pressed` + emojis `aria-hidden` con texto visible: correcto.

**Limitación:** revisión manual, sin barrido automático (axe). No sustituye una auditoría WCAG completa.

---

## 5. Latencia percibida en búsqueda (< 500 ms)

**Método:** análisis de la implementación (`src/api/search.ts`, `src/pages/Search.tsx`) + comportamiento observado en pruebas con MSW. No se hizo micro-benchmark numérico.

**Mecanismos que favorecen la percepción < 500 ms:**
- **Indicador de carga inmediato:** en la primera búsqueda, Search muestra `role="status"` "Buscando alojamientos…" en el mismo render (sin esperar red); en refetch muestra "Actualizando…" (`isFetching`).
- **Debounce selectivo:** las *keywords* se debouncean 300 ms (evita ráfagas al teclear); los **demás filtros aplican de inmediato**.
- **`keepPreviousData`:** la página previa permanece visible mientras llega la siguiente (sin parpadeo a vacío).
- **Cancelación:** las peticiones superadas se abortan vía `AbortSignal` de React Query.
- **Caché:** `staleTime` 30 s (global) para resultados y 60 s para sugerencias; re-visitas sirven desde caché.

**Resultado:** con **MSW** el tiempo "aplicar filtros → ver resultados" es de unos pocos ms; el **indicador de carga** aparece en el mismo frame (< 16 ms). Esto mide el **costo de interfaz**, **NO** la latencia real de red ni de backend.

**PENDIENTE (dependencia externa):** medición real "aplicar filtros → resultados" contra el **Gateway** cuando exponga `/search`. **No medido** hoy.

---

## 6. Matriz RQ → pruebas / pantallas

| RQ | Descripción | Pantallas | Pruebas | Dependencia externa |
|---|---|---|---|---|
| **RQ-04** | Buscar propiedad (filtros, relevancia) | `pages/Search.tsx`, `components/search/FiltersPanel.tsx`, `components/home/SearchBar.tsx`, `components/property/PropertyCard.tsx`, `pages/Home.tsx` | `api/search.test.ts`, `pages/Search.test.tsx`, `pages/Home.test.tsx`, `e2e/catalog.e2e.test.tsx` (recorrido huésped) | Gateway `/search` (G1) — **pendiente**; hoy MSW |
| **RQ-06** | Ver detalle de propiedad | `pages/PropertyDetail.tsx`, `components/property/{PhotoGallery,LocationMap,ReviewsSection,BookingPanel}.tsx` | `api/properties.test.ts`, `pages/PropertyDetail.test.tsx`, `e2e/catalog.e2e.test.tsx` | Gateway `/properties` (G1) — **pendiente**; hoy MSW |
| **RQ-05** | Publicar propiedad (OWNER) | `pages/host/PublishProperty.tsx`, `components/host/*`, `app/RequireRole.tsx` | `api/properties-write.test.ts`, `pages/host/PublishProperty.test.tsx`, `app/RequireRole.test.tsx`, `e2e/catalog.e2e.test.tsx` (recorrido propietario) | Gateway `/properties` (G1) — **pendiente**; hoy MSW |
| **RQ-03** | Editar propiedad + "mis propiedades" | `pages/host/EditProperty.tsx`, `pages/host/MyProperties.tsx` | `api/properties-edit.test.ts`, `pages/host/MyProperties.test.tsx`, `e2e/catalog.e2e.test.tsx` (editar + errores 409/404/403) | Gateway `/properties` (G1) **y** listado por propietario **provisional** `GET /properties?mine=true` — **pendiente** de contrato |
| Seguridad (transversal) | Guards por rol + 401/403 globales con toasts | `app/routes.tsx`, `app/RequireRole.tsx`, `components/ui/Toast.tsx`, `api/queryClient.ts` | `app/RequireRole.test.tsx`, `components/ui/Toast.test.tsx`, `e2e/catalog.e2e.test.tsx` (redirecciones) | — |

---

## 7. Dependencias externas y riesgos pendientes

- **Gateway (G1) no expone aún** `/search` ni `/properties`: todo el Sprint 2 corre contra **MSW**. Al integrar habrá que: medir latencia real (§5), y validar formas/errores reales 400/401/403/404/409.
- **Listado por propietario provisional (RQ-03):** `GET /properties?mine=true` no existe en el contrato de accommodations; se mockea en `test/msw/handlers.ts`. Al publicarse el endpoint real habrá que **alinear ruta/forma** (posible paginación, `ownerId` desde el token) en `api/properties.ts`.
- **Medición de latencia real:** **No medida** (pendiente de Gateway).
- **Fotos en edición:** `EditProperty` cubre los campos editables del `PUT`; la gestión de fotos (añadir/eliminar en edición) usa su propio flujo y queda fuera; el contrato/MSW no expone borrado de fotos.
- **Cobertura global 72.59 %** por archivos fuera de alcance (ver §3). Sin umbral configurado en el proyecto. Riesgo bajo para Sprint 2; recomendable limpiar duplicados legados y, en Sprint 3, subir cobertura de `MyBookings`.
- **Flakiness bajo cobertura:** el perfil `test:coverage` requiere mayor `testTimeout` (§3); documentado, sin cambiar configuración comprometida.
- **E2E con identidad mockeada:** como el resto de la suite, el login real (`/auth/*`) no se ejercita de punta a punta (no mockeado por diseño).

---

## 8. Checklist de Definición de Hecho (Sprint 2, según el backlog)

| Criterio DoD | Estado | Evidencia |
|---|---|---|
| Huésped busca con filtros y ve el detalle completo | ✅ | RQ-04/RQ-06 (§6); `e2e` recorrido huésped |
| Propietario publica y edita con fotos | ✅ (edición cubre campos del PUT; fotos-en-edición fuera de alcance) | RQ-05/RQ-03 (§6) |
| Rutas protegidas por rol | ✅ | `RequireRole`, guards en `routes.tsx`, `e2e` seguridad |
| Búsqueda percibida < 500 ms | ✅ UI (MSW) / ⏳ real **No medido** | §5 |
| Todo consume el backend vía Gateway (`/api/v1`) con bearer; sin secretos | ✅ (vía MSW; rutas reales pendientes G1) | `api/http.ts`, clientes |
| Pruebas (unidad, componentes, E2E con MSW) en verde | ✅ | 190/190 (§2) |
| typecheck y lint limpios | ✅ | §2 |
| Cobertura según umbral del proyecto | ⚠️ Sin umbral definido; global 72.59 %, áreas de Sprint 2 altas | §3 |
| Cada FE-### demostrado por comportamiento y con casilla `[x]` | ✅ FE-006…FE-025 marcadas | `tasks_frontend.md` |

---

## 9. Veredicto

**Sprint 2 (frontend): CUMPLE CON OBSERVACIONES.** Calidad estática y pruebas en verde; accesibilidad básica satisfecha (1 arreglo mínimo aplicado); latencia percibida de UI excelente. Quedan **pendientes por dependencia externa** (medición real contra Gateway y endpoint de listado por propietario), todos documentados en §7.

---
---

# Sprint 3 (FE-040 — RQ-07 a RQ-11)

**Tarea:** FE-040 (verificación del Sprint 3 — reservar, pagar, historial, cancelar, calificar).
**Fecha:** 2026-11-11.
**Alcance:** reserva, pago, mis reservas, reservas recibidas, cancelación, calificar, mis reseñas y la sección de reseñas del detalle.
**Comandos:** `npm run -w @stayhub/web {test,typecheck,lint,test:coverage}`.
**Cambios de código en esta tarea:** **ninguno** — no se hallaron defectos que corregir. Tarea 100 % de verificación.

---

## S3.1 Resumen ejecutivo

**Estado: CUMPLE CON OBSERVACIONES.**

- ✅ Pruebas **320/320** en **32 archivos**, **0 fallos**; **typecheck** y **lint** en verde. El E2E de reservas (`test/e2e/booking.e2e.test.tsx`, 10 pruebas) corrió **3 veces seguidas sin fallos** (estable).
- ✅ Cobertura **global 79.38 %** de líneas (**+6.79 pp** vs. Sprint 2 72.59 %). Las áreas de Sprint 3 están **muy altas**: `api/` 98.28 %, `pages/booking/` 96.73 %, `pages/` 99.40 %.
- ✅ Accesibilidad básica revisada manualmente en las 8 pantallas de Sprint 3: labels asociados, errores/resultados anunciados (`role="alert"`/`role="status"`), estrellas operables por teclado con nombre accesible, estados de pago/reserva/reembolso comunicados con **texto** (no solo color), foco gestionado en pasos de confirmación. **0 bloqueantes, 0 arreglos**; 2 observaciones menores documentadas.
- ✅ Seguridad del frontend: los **tokens de sesión viven solo en memoria** (nunca en almacenamiento persistente); **no se guardan datos de pago/tarjeta** en el navegador; sin `console.*` en `src/`; los comentarios de reseñas se renderizan como **texto** (sin `dangerouslySetInnerHTML`).
- ⚠️ **Dependencia externa (G1):** el Gateway no expone aún `/bookings`, `/payments` ni `/reviews`; todo corre contra **MSW**. Además, `payments-service` es **interno** y la pasarela se **simula en el cliente**, por lo que varios escenarios de pago del backlog (sondeo del estado, pendiente que se resuelve, timeout de la consulta, 5xx del cargo) **no aplican al diseño actual** y quedan como dependencia externa (ver S3.4 y S3.7). La **cancelación por tramos** no está en el contrato (sin plazos/porcentajes): la UI muestra una nota de política genérica.

No se agregaron funcionalidades ni dependencias ni se modificó configuración global.

---

## S3.2 Pruebas, typecheck y lint

| Verificación | Comando | Resultado |
|---|---|---|
| Pruebas (unidad/componentes/E2E) | `npm run -w @stayhub/web test` | **32 archivos, 320 pruebas, 0 fallos** (~56 s) |
| Estabilidad del E2E de reservas | `vitest run test/e2e/booking.e2e.test.tsx` ×3 | **10/10 en las 3 corridas** (~2.3 s de tests c/u) |
| Tipos | `npm run -w @stayhub/web typecheck` (`tsc --noEmit`) | **0 errores** |
| Lint | `npm run -w @stayhub/web lint` (`eslint "src/**/*.{ts,tsx}"`) | **0 errores** |

Archivos de prueba que cubren Sprint 3: `api/bookings.test.ts` (15), `api/bookings-history.test.ts` (14), `api/bookings-cancel.test.ts` (11), `api/payments.test.ts` (6), `api/reviews-write.test.ts`, `pages/booking/Booking.test.tsx` (13), `pages/booking/Payment.test.tsx` (10), `pages/booking/CancelBooking.test.tsx` (8), `pages/booking/ReviewProperty.test.tsx` (6), `pages/MyBookings.test.tsx`, `pages/MyReviews.test.tsx` (6), `pages/host/BookingsReceived.test.tsx` (10), `pages/PropertyDetail.test.tsx` (reseñas FE-038) y `test/e2e/booking.e2e.test.tsx` (10).

---

## S3.3 Cobertura (comparación con Sprint 2)

Proveedor presente: `@vitest/coverage-v8@2.1.9`. **No se instaló nada.** El proyecto **no define umbral** en `vitest.config.ts`.

**Global (v8):** líneas **79.38 %** · ramas **87.80 %** · funciones **85.40 %**
**Sprint 2 (referencia):** líneas 72.59 % · ramas 85.85 % · funciones 82.09 % → **mejora en las tres métricas** (líneas **+6.79 pp**).

| Directorio / archivo (Sprint 3) | Líneas | Ramas | Funciones |
|---|---|---|---|
| `src/api/` | **98.28 %** | 88.41 % | 98.50 % |
| &nbsp;&nbsp;`api/bookings.ts` | **100 %** | 76.92 % | 100 % |
| &nbsp;&nbsp;`api/bookings-cancel.ts` | **100 %** | 95.45 % | 100 % |
| &nbsp;&nbsp;`api/bookings-history.ts` | **100 %** | 96.66 % | 100 % |
| &nbsp;&nbsp;`api/payments.ts` | **100 %** | 100 % | 100 % |
| &nbsp;&nbsp;`api/reviews.ts` | **100 %** | 90.32 % | 100 % |
| `src/pages/booking/` | **96.73 %** | 89.03 % | 93.75 % |
| &nbsp;&nbsp;`Booking.tsx` | 95.17 % | 80.00 % | 90.90 % |
| &nbsp;&nbsp;`CancelBooking.tsx` | 97.36 % | 91.42 % | 100 % |
| &nbsp;&nbsp;`Payment.tsx` | **100 %** | 97.14 % | 85.71 % |
| &nbsp;&nbsp;`ReviewProperty.tsx` | 95.00 % | 91.42 % | 100 % |
| `src/pages/` (MyBookings/MyReviews) | **99.40 %** | 90.87 % | 74.60 % |
| &nbsp;&nbsp;`MyBookings.tsx` | **100 %** | 96.96 % | 81.81 % |
| &nbsp;&nbsp;`MyReviews.tsx` | **100 %** | 100 % | 33.33 % |
| `src/components/property/BookingPanel.tsx` | 95.34 % | 83.33 % | 81.25 % |
| `src/app/` | 85.37 % | 81.03 % | 88.00 % |

**Archivos de menor cobertura entre bookings/payments/cancelación/reseñas:** ninguno queda bajo. Los más bajos del área (líneas) son `Booking.tsx` 95.17 % y `ReviewProperty.tsx` 95.00 %; las líneas sin cubrir son **ramas defensivas** y el **efecto de redirección a login por 401** (p. ej. `Booking.tsx` 48-55, `ReviewProperty.tsx` 49-50/66-68). `MyReviews.tsx` muestra funciones 33.33 % por tener pocas funciones instrumentadas (líneas 100 %), no es una brecha funcional.

**Nota de medición (idéntica a Sprint 2, no es fallo de producto):** `test:coverage` tal cual puede exceder el `testTimeout` por defecto bajo la instrumentación v8 en un caso de `app/App.test.tsx`. Se midió con **override por CLI** `--testTimeout=30000`, **sin** modificar configuración comprometida ni pruebas. La suite normal es estable (320/320).

---

## S3.4 Accesibilidad (revisión manual)

**Sin herramienta automática** (`jest-axe`/`axe-core` ausentes; no se instala por regla). Revisión manual con roles/etiquetas de Testing Library, apoyada en las pruebas de cada pantalla.

| Pantalla | Labels / errores | Texto ≠ color; resultado anunciado | Teclado / foco | Nombre accesible / alt |
|---|---|---|---|---|
| Reserva (`Booking.tsx`) | OK — `<label>` en habitación/entrada/salida/huéspedes; errores en `role="alert"` | OK — resumen `dl aria-label="Resumen de la reserva"` | OK — alerta recibe foco al fallar (`tabIndex=-1`), sin trampa | OK — botón "Confirmar reserva" |
| Pago (`Payment.tsx`) | OK — `<label for="payment-token">` | OK — fases con **texto**: "Procesando…", "¡Pago aprobado!…", rechazo; `role="status"`/`"alert"` | OK — cada resultado recibe foco (ref) | OK — "Pagar"/"Reintentar"/"Ver mis reservas" |
| Mis reservas (`MyBookings`/`HistoryShell`) | OK — filtros con `<label>`; carga `role="status"`; error `role="alert"`+Reintentar | OK — estado como **etiqueta de texto** (`BOOKING_STATUS_LABELS`), no color | OK | OK — lista `aria-label`; enlaces con texto |
| Reservas recibidas (`BookingsReceived`) | OK — mismo shell + filtro "Propiedad" con `<label>` | OK — estado en texto | OK | OK — lista `aria-label="Reservas recibidas"` |
| Cancelación (`CancelBooking`) | OK — motivo `<label for="cancel-reason">`; error `role="alert"` | OK — resultado `role="status"` con estado **en texto** + reembolso en texto | OK — resultado/alerta reciben foco; botón **deshabilitado** sin motivo (anfitrión) | OK — "Confirmar cancelación" |
| Calificar (`ReviewProperty`) | OK — comentario `<label for="review-comment">`; validación `role="alert"` | OK — éxito `role="status"`; no disponible `role="alert"` | OK — estrellas = `<button aria-label="N estrellas" aria-pressed>` en `role="radiogroup"`, operables con Tab+Enter/Espacio | OK — estrellas con nombre accesible |
| Mis reseñas (`MyReviews`) | OK — carga `role="status"`; error `role="alert"`+Reintentar | OK | OK | OK — lista `aria-label="Mis reseñas"`; `Stars` `role="img" aria-label`; `<time dateTime>` |
| Reseñas del detalle (`ReviewsSection`) | OK — error `role="alert"`+Reintentar; carga `role="status"` | OK — promedio y conteo en texto | OK | OK — `Stars` con `aria-label`; comentarios como **texto** |

**Hallazgos (observaciones menores, no bloqueantes, no corregidas para no alterar funcionalidad):**
- **Campos de fecha sin `aria-invalid` por campo** en `Booking.tsx`/`BookingPanel.tsx`: los errores se anuncian en un **resumen `role="alert"` con foco gestionado** (accesible), pero no marcan `aria-invalid` en cada input. Candidato a mejora.
- **Estrellas como `role="radiogroup"` con `<button aria-pressed>`** (cada estrella es parada de Tab) en lugar de radios nativos con navegación por flechas: totalmente operable por teclado y con nombre accesible, sin trampa; no es la interacción estricta de un radiogroup ARIA. Candidato a mejora.

**Limitación:** revisión manual, sin barrido automático (axe); no sustituye auditoría WCAG completa.

---

## S3.5 Escenarios de error: pago y cancelación (y reserva)

> "Cubierto" = existe prueba que lo ejercita. "No aplica (dep. ext.)" = el diseño actual no implementa ese flujo (pasarela simulada en cliente / el contrato no lo define); documentado, **no inflado como cumplido**.

### Pago (RQ-07)
| Escenario | Prueba | Estado |
|---|---|---|
| Pago fallido con mensaje y reintento | `Payment.test` "declined payment"; `payments.test` "declines a token flagged for decline" | ✅ Cubierto |
| Reintento **sin cobro doble** | `Payment.test` "charges once on double click"; `bookings.test` "idempotent… same key"; `booking.e2e` "retry neither duplicates the booking nor the charge" | ✅ Cubierto |
| Retoma de un pago pendiente al recargar | `Payment.test` "resumes on reload without creating another payment"; "shows the confirmed state when already paid" | ✅ Cubierto |
| Error al **cargar** la reserva (5xx) con reintento | `Payment.test` "retryable error on a server failure without losing the context" | ✅ Cubierto |
| Pendiente que se resuelve (sondeo) · timeout de la consulta · 5xx/red del **cargo** | — | ⚠️ No aplica (dep. ext.): `payments-service` es interno y la pasarela se **simula en cliente** (`api/payments.ts`); no hay sondeo `GET /payments/:id/status`. Aplicará cuando exista endpoint de pago con estado. |

### Cancelación (RQ-09/RQ-10)
| Escenario | Prueba | Estado |
|---|---|---|
| Justificación del propietario (obligatoria) | `CancelBooking.test` "requires a non-empty justification"; `bookings-cancel.test` "requires a non-empty justification (400 by field)" | ✅ Cubierto |
| Reserva no cancelable (409) | `CancelBooking.test` "non-cancelable booking" / "server conflict (409)"; `bookings-cancel.test` "rejects a non-cancelable stay (409)" | ✅ Cubierto |
| Doble cancelación **sin segundo reembolso** | `bookings-cancel.test` "does not duplicate the refund on a second cancel (409)" | ✅ Cubierto |
| Estados de reembolso (en proceso/reembolsado/parcial/sin) | `bookings-cancel.test` "maps payment/refund states to Spanish UI text"; `CancelBooking.test` resultado | ✅ Cubierto |
| Prohibido (403) / no encontrada (404) / 401 | `CancelBooking.test` 403/404/401; `bookings-cancel.test` 401/403/404 | ✅ Cubierto |
| Política **por tramos** (plazos/%) | nota de política genérica en UI | ⚠️ No aplica (dep. ext.): el contrato no define plazos ni porcentajes; el backend decide el reembolso y la UI nunca recalcula montos. |

### Reserva (RQ-07)
| Escenario | Prueba | Estado |
|---|---|---|
| Disponibilidad perdida (409) sin perder lo ingresado | `Booking.test` "rejects overlapping dates (409) and keeps the entered values"; `bookings.test` "409 BOOKING_CONFLICT"; `booking.e2e` disponibilidad | ✅ Cubierto |
| Sesión expirada (401) → login con destino | `Booking.test` "redirects to login on 401"; `bookings.test` "requires an authenticated session (401)" | ✅ Cubierto |
| Permisos (403) con mensaje claro | `bookingErrorMessage` 403; guards de rol (`booking.e2e` seguridad); 403 en cancelar/reseñar | ✅ Cubierto (a nivel guard/cancel/review; la creación de reserva no tiene ruta 403) |
| Errores de campo (400) sin perder input | `Booking.test` "server field errors (400) without losing input" | ✅ Cubierto |

---

## S3.6 Seguridad del frontend

- **Tokens de sesión solo en memoria.** `SessionStore` mantiene el par de tokens en `this.pair` (campo privado); comentario explícito: *"Tokens never enter persistent storage"*. En `localStorage` solo se guarda `stayhub_auth_epoch` (UUID **no secreto** para coherencia de logout entre pestañas) y se **eliminan** claves legadas (`stayhub_users`/`stayhub_session`). Verificado por `grep` de `localStorage`/`sessionStorage` en `src/`.
- **Sin datos de pago en el navegador.** El token de pago vive en `useState` de `Payment.tsx` (opaco, simulado) y **nunca** se persiste ni se envía a almacenamiento. `BookingContext` persiste solo **resúmenes de reserva legados** (sin tarjeta ni token).
- **Sin datos sensibles en consola/logs.** `grep` de `console.(log|debug|info|warn|error)` en `src/` (excluyendo pruebas) → **0 coincidencias**.
- **Comentarios de reseñas como texto.** `ReviewsSection` y `MyReviews` renderizan `{review.comment}` como nodo de texto (React escapa); **sin** `dangerouslySetInnerHTML` en todo `src/`.

---

## S3.7 Matriz RQ → pruebas y pantallas

| RQ | Descripción | Pantallas | Pruebas | Dependencia externa |
|---|---|---|---|---|
| **RQ-07** | Reservar + pagar (mock pasarela) | `pages/booking/{Booking,Payment}.tsx`, `BookingPanel`, `api/{bookings,payments}.ts` | `api/bookings.test`, `api/payments.test`, `Booking.test`, `Payment.test`, `booking.e2e` (feliz, pago fallido+reintento, disponibilidad) | Gateway `/bookings` (G1); `payments-service` **interno/simulado** → sin sondeo/estado real; E2E real omitido |
| **RQ-08** | Historial de reservas (huésped y propietario) | `pages/MyBookings.tsx`, `pages/host/BookingsReceived.tsx`, `api/bookings-history.ts` | `api/bookings-history.test`, `MyBookings.test`, `BookingsReceived.test`, `booking.e2e` | Gateway `/bookings/history` (G1); **listado de huésped provisional** `GET /bookings` (no está en el contrato) |
| **RQ-09** | Cancelación del huésped + reembolso | `pages/booking/CancelBooking.tsx`, `api/bookings-cancel.ts` | `api/bookings-cancel.test` (huésped), `CancelBooking.test` (huésped), `booking.e2e` cancelación huésped | Gateway `DELETE /bookings/:id` (G1); sin plazos/% (sin tramos) |
| **RQ-10** | Cancelación del propietario con justificación | `pages/booking/CancelBooking.tsx`, `api/bookings-cancel.ts` | `api/bookings-cancel.test` (owner), `CancelBooking.test` (owner), `booking.e2e` cancelación propietario | Gateway `DELETE /bookings/:id` (G1) |
| **RQ-11** | Calificar estadía completada; reflejar en reseñas y detalle | `pages/booking/ReviewProperty.tsx`, `pages/MyReviews.tsx`, `components/property/ReviewsSection.tsx`, `pages/PropertyDetail.tsx`, `api/reviews.ts` | `api/reviews-write.test`, `ReviewProperty.test`, `MyReviews.test`, `PropertyDetail.test` (FE-038), `booking.e2e` calificación | Gateway `/reviews` (G1) |
| Seguridad (transversal) | Guards de rol; 401/403 globales; redirección a login con destino | `app/routes.tsx`, `app/RequireRole.tsx`, `api/queryClient.ts` | `booking.e2e` seguridad (anónimo→login; huésped fuera de `/host/*`; propietario no reseña su propiedad) | — |

---

## S3.8 Dependencias externas y riesgos pendientes

- **Gateway (G1) no expone** `/bookings`, `/bookings/history`, `/reviews` ni pago de huésped: **todo Sprint 3 corre contra MSW**. Al integrar: validar formas/errores reales (400/401/403/404/409) y alinear rutas.
- **`payments-service` interno / pasarela simulada en cliente:** no hay endpoint de pago expuesto al huésped ni sondeo de estado. Los escenarios de **pendiente-que-resuelve, timeout de consulta y 5xx/red del cargo** quedan **fuera** hasta que exista ese endpoint (S3.5).
- **Listado de reservas del huésped provisional:** `GET /bookings` no está en el contrato de `booking_service` (solo lookup por id). Mockeado; alinear cuando se publique.
- **Cancelación por tramos:** el contrato **no define** plazos ni porcentajes; la UI muestra nota genérica y refleja `paymentStatus` del backend. Si el negocio define tramos, habrá que reflejarlos.
- **E2E contra entorno real: NO implementado** (rutas no expuestas). `test/e2e/booking.e2e.test.tsx` documenta en cabecera que un pase real (tras G1, detrás de variable de entorno explícita, sin datos reales de tarjeta) debe añadirse y quedar omitido por defecto en `npm test`.
- **Identidad mockeada** en pruebas (como todo el suite): el login real (`/auth/*`) no se ejercita de punta a punta por diseño.
- **Medición de cobertura** requiere override de `testTimeout` bajo v8 (S3.3); documentado, sin cambio de configuración comprometida.

---

## S3.9 Checklist de Definición de Hecho (Sprint 3, según el backlog)

| Criterio DoD | Estado | Evidencia |
|---|---|---|
| Huésped reserva, paga (mock) y ve la reserva confirmada | ✅ (MSW) | RQ-07 (S3.7); `booking.e2e` feliz |
| Reintento de pago sin cobro doble; retoma de pago al recargar | ✅ | S3.5 pago |
| Historial del huésped y del propietario con filtros y estado en texto | ✅ | RQ-08; `MyBookings`/`BookingsReceived` |
| Cancelación con política visible, justificación del propietario y estado de reembolso | ✅ | RQ-09/RQ-10; S3.5 |
| Calificación tras estadía completada; reflejo en reseñas y detalle | ✅ | RQ-11; `booking.e2e` calificación |
| Rutas/acciones protegidas; redirección a login con destino | ✅ | S3.7 seguridad; `booking.e2e` |
| Pruebas (unidad, componentes, E2E con MSW) en verde y E2E estable | ✅ | 320/320; E2E 10/10 ×3 (S3.2) |
| typecheck y lint limpios | ✅ | S3.2 |
| Cobertura según umbral del proyecto | ⚠️ Sin umbral definido; global 79.38 % (+6.79 pp), áreas Sprint 3 altas | S3.3 |
| Sin datos de pago/tokens persistidos; comentarios como texto | ✅ | S3.6 |
| Integración real contra Gateway | ⏳ **No medido** — dependencia externa G1 | S3.8 |
| Cada FE-### demostrado y con casilla `[x]` | ✅ FE-027…FE-040 | `tasks_frontend.md` |

---

## S3.10 Veredicto

**Sprint 3 (frontend): CUMPLE CON OBSERVACIONES.** Calidad estática y pruebas en verde (320/320), E2E estable, cobertura al alza y accesibilidad/seguridad básicas satisfechas **sin necesidad de correcciones**. Los pendientes son **por dependencia externa** (Gateway G1, pasarela de pago real con sondeo de estado, E2E contra entorno real y cancelación por tramos), todos documentados en S3.8 y **no inflados** como cumplidos. Con esto se cierra el backlog del frontend **FE-001 a FE-040**.
