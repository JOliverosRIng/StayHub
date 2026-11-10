# Validación de la conexión frontend–Gateway

Fecha: 2026-11-04. Entorno de ejecución: Windows, Node 24.21.0 y npm 11.19.0. El proyecto sigue declarando Node 20; esta ejecución no sustituye CI con esa versión.

## Resultado implementado

Registro y login consumen /api/v1; registro envía rol e idempotencia y dirige al login. Sesión con access token en memoria, cookie HttpOnly, renovación coordinada entre pestañas, descarte de respuestas después de logout y consulta de perfil para mostrar el nombre. Alojamientos y reservas siguen locales.

Gateway incorpora logout 204 sin dependencia de Auth. El cierre elimina la cookie, sin revocar tokens emitidos. Swagger se monta en desarrollo y conserva las rutas generadas; registro/login se documentan como públicos. Vite usa HTTPS y valida TLS del Gateway contra la CA local.

## Comprobaciones realizadas

| Comprobación | Resultado |
| --- | --- |
| Web: Vitest | 30 pruebas aprobadas en 5 archivos. |
| Cobertura de módulos de identidad modificados | 98,29 % líneas/sentencias; 82,64 % ramas; 86,95 % funciones. Incluye API, sesión, contexto, login y registro; no representa cobertura de toda la web. |
| Web: tipos, lint y build de producción | Aprobados. |
| Gateway: tipos y lint | Aprobados. |
| Gateway: logout, montaje de Swagger, fábrica OpenAPI y contratos de registro/sesión | 45 pruebas aprobadas en la ejecución final de esas 4 suites. |
| Gateway: deriva OpenAPI público | 25 pruebas aprobadas, incluidas las 8 operaciones y casos negativos del validador. |
| Gateway: workspaces, cookies, composición de autenticación, servidor público y ejemplo de entorno | Suites afectadas aprobadas en comprobaciones previas. |
| Users: regresión unitaria después de generar Prisma | 82 pruebas aprobadas, 9 suites. |
| Auth: regresión unitaria | Reglas de registro, login, refresh, sesión, criptografía y configuración aprobadas. La prueba de permisos POSIX del generador falla en Windows (0600 frente a 0666). Las suites bloqueadas por Prisma se repitieron después de generar clientes: cleanup guard aprobado y HTTP aprobado con testTimeout=30000, tras agotar originalmente 5000 ms. |
| Scripts locales | Sintaxis de dev-gateway, setup-web-https y dev-auth-swagger comprobada. |

La instalación inicial reveló dependencias transitivas ausentes en el lockfile, incluso tras npm ci. Se regeneró desde los cuatro manifiestos en una carpeta temporal y se instaló el árbol completo. Los clientes Prisma se generaron sin migrar bases.

## Verificación pendiente

No se verificó el recorrido real navegador → Vite → Gateway → Auth/Users. Docker Desktop se inició, pero el motor devolvió HTTP 500; no se continuó tras rechazarse una comprobación adicional. La instalación de confianza de la CA se canceló en Windows. Se generaron el certificado de localhost y la CA pública para el proxy, sin desactivar TLS ni instalar confianza por otra vía.

Para cerrar esa verificación: disponer del motor Docker operativo, completar voluntariamente npm run env:web:https y seguir el arranque de frontend-gateway.md. Registrar ambos roles, iniciar sesión, comprobar nombre, recargar, renovar entre pestañas y cerrar sesión; verificar que otra recarga no restaura la sesión. También faltan el harness completo Auth–Users y la validación con Node 20.

La ejecución amplia de Gateway encontró fallos ajenos a esta integración: suites de registro/login que requieren Redis real y divergencias históricas de Problem/FieldError en el contrato Users. El archivo .github/workflows/ci.yml ya contiene marcadores de conflicto sin resolver; no se modificó ni se afirma que CI esté verde.

AGENT.md se actualizó localmente; continúa ignorado por la regla existente de .gitignore. Los Pact generados durante las pruebas se restauraron al contenido inicial; no forman parte de esta implementación.
