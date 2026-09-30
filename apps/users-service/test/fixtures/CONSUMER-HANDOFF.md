# Entrega Users para G1/G3

`consumer-handoff.fixture.ts` genera UUID y correos `example.test` desechables,
un comando de registro estable para reintentos y las rutas internas Users.
`users-provider.contract.spec.ts` ejecuta estos datos directamente contra Users
y PostgreSQL 16 con migraciones reales. No representa una aprobación de G1/G3.

G3 debe conectar su orquestador real y JWT de servicio configurado, comprobar
timeouts/reintentos con el mismo registrationId/userId, activación/cancelación,
lookup exclusivamente ACTIVE y login genérico tras cambiar el correo. Users no
almacena credenciales ni emite tokens productivos. Los firmantes de
`users.fixture.ts` son exclusivamente para pruebas aisladas del proveedor.

El PATCH utiliza `multipart/form-data`, con el objeto JSON en el campo `profile`
y la foto opcional en `photo`; no acepta un body `application/json` directo.

G1 debe conectar HTTPS, introspección, stripping de headers y forwarding real
del bearer/traceId; comprobar ownership, multipart/foto y errores
401/403/404/409/413/415. Los bytes sintéticos de `profile.fixture.ts` sirven para
las pruebas de firma MIME de Users, no como evidencia visual de un archivo real.

Para USR-074 faltan expectativas aprobadas por ambos consumidores y una ejecución
con sus clientes. Para USR-077 G1 debe registrar URL HTTPS, versiones de servicios,
resultado del flujo registro/login/perfil/cambio de correo y corrección de fallos
por responsable, sin registrar JWT, credenciales ni PII. No se crean suites de
consumidor vacías, simulaciones de Auth/Gateway ni pruebas omitidas para cerrar
estas dependencias.
