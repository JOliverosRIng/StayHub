# Frontend conectado al API Gateway

El navegador usa exclusivamente /api/v1 bajo el origen del frontend. Vite termina HTTPS en localhost:5173 y reenvía /api al Gateway HTTPS en localhost:8080. El proxy verifica el certificado del Gateway con la CA local; no usar secure:false ni NODE_TLS_REJECT_UNAUTHORIZED=0.

## Preparación

Usar Node 20 y Docker Desktop o Podman activo. Instalar mkcert en el sistema y ejecutar desde la raíz:

```powershell
npm ci
npm run env:auth:dev
npm run env:web:https
```

El último comando instala la CA de desarrollo en los almacenes de confianza locales mediante mkcert (puede pedir confirmación del sistema), genera certificados para localhost/127.0.0.1/::1 y copia únicamente el certificado público de la CA a secrets/rootCA.pem. Las claves existentes no se rotan. Nunca compartir la clave privada de la CA ni versionar secrets/. Si se cambia de CA, regenerar también el certificado de localhost. Reiniciar el navegador si no reconoce la nueva confianza.

## Arranque (tres terminales)

1. npm run dev:swagger -- --build — Auth y Users reales, migraciones y dependencias persistentes.
2. npm run dev:gateway — Redis de borde aislado en 56381, compilación y Gateway HTTPS en 8080.
3. npm run dev:web — abrir https://localhost:5173.

Swagger del Gateway queda disponible en https://localhost:8080/docs durante development.

El script de Gateway reutiliza las claves y claims Gateway→Auth y Auth→Users generados para Swagger. Auth escucha en 3001, Users en 3002. Los puertos de bases y Redis de Auth siguen la guía dev-swagger.md. Los procesos nativos se detienen con Ctrl+C; los contenedores conservan sus datos y se pueden detener desde Docker Desktop. No ejecutar down -v para apagar desarrollo.

Para modificar el destino del proxy usar WEB_GATEWAY_URL; WEB_TLS_CERT_FILE, WEB_TLS_KEY_FILE y WEB_TLS_CA_FILE permiten rutas alternativas desde la raíz. Son parámetros del servidor Vite, nunca secretos VITE_* enviados al navegador. Mantener el mismo hostname y esquema HTTPS en el navegador. No hace falta CORS.

## Comportamiento

Registro exige nombre, correo, contraseña y rol GUEST/OWNER. El frontend genera Idempotency-Key y conserva la clave en reintentos del mismo formulario. Registro exitoso dirige al login con el correo precargado; no inicia sesión automáticamente.

Access token y datos de sesión viven en memoria. La cookie de refresh es Secure, HttpOnly y SameSite=Strict, restringida a /api/v1/auth/refresh. Al recargar se restaura la sesión mediante refresh. Se requiere un navegador moderno con Web Locks y BroadcastChannel para coordinar pestañas; sin Web Locks se falla de forma explícita y no se renueva sin coordinación.

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
