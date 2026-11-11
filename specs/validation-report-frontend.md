# Reporte de validación — Frontend Sprint 2 (`apps/web`)

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
