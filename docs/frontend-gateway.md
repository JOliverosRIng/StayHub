# Frontend conectado al API Gateway

El frontend de desarrollo se abre en `http://localhost:5173`. Vite reenvía `/api` por HTTP al Gateway local en `127.0.0.1:8080`.

## Preparación

Usar Node 20 y Docker Desktop o Podman activo. Ejecutar desde la raíz.

```powershell
npm ci
npm run env:auth:dev
```

## Arranque (cuatro terminales)

1. npm run dev:swagger -- --build — Auth y Users reales, migraciones y dependencias persistentes.
2. npm run dev:backend — Accommodations, Search, Bookings, Payments, Reviews y Notifications nativos (ver [dev-local-completo.md](dev-local-completo.md)).
3. npm run dev:gateway — Redis de borde aislado en 56381, compilación y Gateway HTTP en 8080.
4. npm run dev:web — abrir http://localhost:5173.

Comprobación sin navegador: `npm run smoke:local`.

Swagger del Gateway queda disponible en http://127.0.0.1:8080/docs durante development.

El script de Gateway reutiliza las claves y claims Gateway→Auth y Auth→Users generados para Swagger. Auth escucha en 3001, Users en 3002. Los puertos de bases y Redis de Auth siguen la guía dev-swagger.md. Los procesos nativos se detienen con Ctrl+C; los contenedores conservan sus datos y se pueden detener desde Docker Desktop. No ejecutar down -v para apagar desarrollo.

Para cambiar el destino del proxy, configura `WEB_GATEWAY_URL` en el entorno. Abre la web con `localhost` para que el navegador pueda habilitar Web Locks.

## Comportamiento

Registro exige nombre, correo, contraseña y rol GUEST/OWNER. El frontend genera Idempotency-Key y conserva la clave en reintentos del mismo formulario. Registro exitoso dirige al login con el correo precargado; no inicia sesión automáticamente.

Access token y datos de sesión viven en memoria. La cookie de refresh usa HttpOnly y SameSite=Strict. El Gateway aplica Secure en HTTPS. La cookie queda restringida a /api/v1/auth/refresh. Al recargar se restaura la sesión mediante refresh. Se requiere un navegador moderno con Web Locks y BroadcastChannel para coordinar pestañas; sin Web Locks se falla de forma explícita y no se renueva sin coordinación.

POST /api/v1/auth/logout devuelve 204 y elimina la cookie aunque no exista. No revoca tokens ya emitidos ni la sesión en Auth. Si el cierre falla por red, reintentarlo desde el aviso antes de abandonar el sitio.

Las cuentas simuladas anteriores se eliminan del almacenamiento local; no se migran contraseñas. Alojamientos y reservas siguen siendo demostraciones locales. Las reservas antiguas no se reasignan al UUID del usuario real. No se implementan perfil editable, recuperación ni proveedores sociales.

## Verificación

```powershell
npm run typecheck:web
npm run lint:web
npm run test:web
npm run build:web
npm run typecheck:gateway
npm run lint:gateway
npm run test --workspace @stayhub/api-gateway -- --selectProjects unit contract
npm run build:gateway
```

Con los servicios activos: registrar una cuenta de cada rol con correos distintos, iniciar sesión, comprobar nombre, recargar, abrir otra pestaña, renovar y cerrar sesión. Al recargar tras cerrar no debe restaurarse. Probar indisponibilidad de Users (nombre genérico), Auth (aviso/reintento) y errores de formulario. La validación del backend es autoritativa.

En producción servir la web mediante HTTPS y enrutar /api al Gateway desde el mismo origen. Vite es solo el servidor de desarrollo; no desplegar claves ni certificados locales.

Resultados de esta implementación y pendientes de entorno: [frontend-gateway-validation.md](frontend-gateway-validation.md).
