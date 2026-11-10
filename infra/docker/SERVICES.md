# Payments y notificaciones en Docker

## Prueba visual con Swagger

Con los contenedores iniciados, abre:

- Payments: http://localhost:3006/docs
- Notificaciones: http://localhost:3009/docs

Estas páginas se habilitan solo en desarrollo. Permiten ejecutar las operaciones
con **Try it out**, editar el JSON y ver el código HTTP y la respuesta.

Para probar un cobro, ejecuta `npm run token:services -- payments charge`.
Copia el token en **Authorize → serviceJwt** (sin escribir `Bearer`), abre
`POST /payments`, pulsa **Try it out**, y usa `Idempotency-Key`:
`73bb6211-09ed-4ff6-a53b-7e02e242943a` y este JSON:

```json
{
  "bookingId": "794e39f7-7903-4b32-a833-55edb2bfbd19",
  "payerUserId": "bfbaf9f6-66a0-4119-bc7b-f1604feb323a",
  "amountMinor": 125000,
  "currency": "COP",
  "paymentMethod": { "type": "CARD_TOKEN", "token": "tok_approved" }
}
```

Pulsa **Execute**: debe responder `201` con `status: APPROVED`. Repetir el
mismo cuerpo y clave devuelve el mismo pago. Para crear otro pago, cambia
`bookingId` y la clave por UUID nuevos. Para reembolsar o consultar, genera un
token con `payments refund` o `payments read`, respectivamente; reemplaza la
autorización y usa el identificador del pago devuelto. Los tokens de servicio
caducan en cinco minutos.

Para notificaciones, genera `npm run token:services -- notifications send`,
autoriza **serviceJwt**, abre `POST /notifications/send`, usa una clave de
idempotencia nueva y este cuerpo:

```json
{
  "userId": "bfbaf9f6-66a0-4119-bc7b-f1604feb323a",
  "type": "SYSTEM_ALERT",
  "channel": "IN_APP",
  "templateData": {
    "alertCode": "TEST_LOCAL",
    "title": "Prueba visible",
    "message": "Mi primera notificacion"
  }
}
```

Debe responder `201` con `status: SENT`. Para ver el historial, genera
`npm run token:services -- notifications read bfbaf9f6-66a0-4119-bc7b-f1604feb323a`,
autoriza **accessJwt** y ejecuta `GET /notifications/user/{id}` con ese usuario.

## Operación

Desde la raíz, con Node 20 y Docker en ejecución:

```powershell
npm run dev:services:up
npm run test:services:smoke
docker compose -f docker-compose.services.yml ps -a
```

Payments queda en `http://localhost:3006` y notificaciones en
`http://localhost:3009`. Ambos exponen `/health/ready`. Las rutas de negocio
requieren JWT RS256; la prueba smoke genera tokens locales y comprueba cobro,
reembolso, notificación in-app, idempotencia, autorización y persistencia al
reiniciar servicios y bases de datos. La prueba deja registros sintéticos.

Cada servicio tiene PostgreSQL independiente, un volumen persistente y un
contenedor de migraciones que termina con código 0 antes de iniciar la app.
Payments dispone de RabbitMQ para publicar su outbox. Los puertos de las bases
y RabbitMQ no se publican al host. Los servicios HTTP solo se publican en loopback.

La configuración y las claves locales se generan en `.artifacts/services`,
excluido de Git, sin reemplazar las credenciales existentes. No se reutiliza ni
modifica el contenedor anterior `stayhub-notifications-db`. El código de
notificaciones se recuperó de la rama `feat/notifications-service`.

```powershell
# Detener conservando los datos
npm run dev:services:down
# Volver a iniciar
npm run dev:services:up
# Pruebas del código recuperado
npm run test:notifications
```

Este entorno usa la pasarela simulada de Payments y el adaptador de correo
simulado de Notifications. Las notificaciones in-app sí se almacenan en
PostgreSQL. Para enviar correo real se requiere configurar SMTP y su entrega
TLS según `apps/notifications-service/README.md`. No hay un consumidor automático
de eventos de pagos en Notifications: el productor debe usar su API autenticada.

Notifications conserva su instalación independiente (`npm --prefix
apps/notifications-service ci`) para mantener aislado su cliente Prisma.
