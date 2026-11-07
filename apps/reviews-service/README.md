# reviews-service

Microservicio NestJS de StayHub para RQ-11 y la contribución de reseñas a RQ-06. Es dueño exclusivo de `reviews_db`, escucha internamente en el puerto 3007 y valida la elegibilidad de una estadía mediante el contrato REST publicado por `bookings-service`.

## Operación local

```powershell
npm run prisma:reviews:generate
npm run build:reviews
npm run test:reviews:unit
docker compose -f docker-compose.reviews.yml config
```

Los contratos fuente viven en `specs/003-reservas-pagos-resenas/reviews_service/contracts/`. Copie `.env.example` a un archivo local ignorado y suministre secretos por archivos; nunca versionar credenciales.

## Límites

No administra reservas, propiedades, usuarios, moderación, edición ni eliminación. No usa Redis o RabbitMQ en este incremento y no accede a bases de otros servicios. Las pruebas con stub demuestran aislamiento, no integración distribuida con Gateway o Bookings.
