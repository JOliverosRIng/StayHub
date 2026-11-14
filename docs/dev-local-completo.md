# Entorno local completo: Web → Gateway → Servicios

Levanta todo StayHub en la máquina local con HTTP simple. Los servicios corren como procesos
Node nativos; PostgreSQL, Redis y RabbitMQ corren en contenedores con puertos solo en `127.0.0.1`.

## Requisitos

- Node 20 y Docker Desktop (o Podman) en ejecución.
- Una vez: `npm ci` y `npm run env:auth:dev` (genera `.env` y `secrets/`, no se versionan).

## Arranque (cuatro terminales, desde la raíz)

| Orden | Comando | Qué levanta |
|---|---|---|
| 1 | `npm run dev:swagger` | Auth (3001) y Users (3002) + sus PostgreSQL/Redis |
| 2 | `npm run dev:backend` | Accommodations (3003), Search (3004), Bookings (3005), Payments (3006), Reviews (3007), Notifications (3009) + PostgreSQL/PostGIS (55450), RabbitMQ (55673, UI 15673) y Redis de Search (56382) |
| 3 | `npm run dev:gateway` | Redis de borde (56381) + Gateway HTTP en `http://127.0.0.1:8080/api/v1` |
| 4 | `npm run dev:web` | Vite en `http://localhost:5173` (proxy `/api` → Gateway) |

La primera ejecución de `dev:backend` instala las dependencias aisladas de Notifications, genera
los clientes Prisma y compila cada servicio. Para recompilar después de cambiar código de un
servicio: `npm run dev:backend -- --build`. Las migraciones se aplican en cada arranque
(`prisma migrate deploy`).

Ctrl+C detiene los procesos. Los contenedores y sus volúmenes se conservan; para bajarlos al
salir usa `npm run dev:backend -- --down-deps`. No uses `down -v` si quieres conservar los datos.

## Comprobación rápida

Con las tres primeras terminales activas:

```powershell
npm run smoke:local
```

Recorre a través del Gateway: registro/login OWNER y GUEST, perfil, crear propiedad, subir foto,
publicar, detalle anónimo, búsqueda, sugerencias, reseñas, reserva (Bookings → Accommodations →
Payments → evento RabbitMQ → `CONFIRMED`) e historial del dueño. Deja datos sintéticos con correos
`@stayhub.test`.

Swagger de cada servicio: `http://127.0.0.1:<puerto>/docs`. Swagger del Gateway:
`http://127.0.0.1:8080/docs`.

## Rutas que expone el Gateway

| Ruta pública (`/api/v1`) | Destino | Credencial hacia el servicio |
|---|---|---|
| `/auth/*` | Auth | service JWT `auth:invoke` |
| `/users/{id}/profile[/photo]` | Users | bearer del usuario |
| `GET /properties/{id}` (anónima u OWNER), `POST /properties`, `PUT /properties/{id}`, `POST /properties/{id}/photos` (OWNER) | Accommodations | bearer del usuario (si existe) |
| `GET /search`, `GET /search/suggest` (públicas) | Search | service JWT `search:invoke` |
| `/bookings*` | Bookings | JWT delegado `bookings:invoke` |
| `/reviews*`, `GET /properties/{id}/reviews` | Reviews | bearer del usuario o service JWT `reviews:read` |

Payments y Notifications son internos: solo los invoca Bookings. El Gateway no los publica.

## Claves y tokens locales

- El access JWT de Auth lo validan Gateway, Users, Accommodations, Reviews, Payments y Notifications.
- La clave del Gateway firma los service JWT hacia Auth, Search, Bookings y Reviews.
- `dev:backend` crea una clave local de Bookings (`secrets/services-dev-bookings-private.pem`) y
  rota cada minuto, en `.artifacts/dev-backend/tokens/`, los tokens salientes de Bookings y el de
  Reviews → Bookings. Payments, Notifications y Accommodations rechazan service JWT con más de
  300 s, y Bookings/Reviews releen esos archivos en cada llamada.

## Limitaciones conocidas (requieren cambios en servicios)

- **Búsqueda vacía**: Search se alimenta de eventos `stayhub.search.v1`, pero Accommodations no
  tiene productor/outbox. `GET /search` responde 200 con `items: []` hasta que exista.
- **"Mis propiedades"** (`GET /properties?mine=true`) y **"Mis reservas" del huésped**
  (`GET /bookings`): la web los llama, pero Accommodations y Bookings no tienen esas rutas;
  el Gateway responde 404.
- **Bytes de fotos de propiedades**: Accommodations solo devuelve metadatos; no hay ruta de
  descarga, así que las imágenes no se muestran.
- El pago con tarjeta en la web es simulado en el cliente (ver `apps/web/src/api/payments.ts`);
  la reserva se confirma en el servidor con la pasarela simulada de Payments.
