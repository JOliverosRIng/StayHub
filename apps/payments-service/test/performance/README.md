# Perfil de latencia de Payments

## Ejecución

```powershell
npm run test:performance:profile --workspace @stayhub/payments-service
```

El runner levanta PostgreSQL 16 desechable, aplica las migraciones y ejecuta NestJS contra el mock durable de la pasarela. Para cada endpoint hace 10 solicitudes de calentamiento y mide 40 solicitudes HTTP locales secuenciales. El p95 usa el rango más cercano (nearest rank); el límite de aceptación es menor de 500 ms.

## Última medición

Entorno de esta ejecución: Node.js 20.20.2, Docker 29.7.2, PostgreSQL 16 Alpine, proceso NestJS local en Windows. No se conecta a RabbitMQ. Cada POST crea una reserva e idempotency key únicas y cobra con el mock aprobado.

| Endpoint | Muestras | p95 medido | Límite |
| --- | ---: | ---: | ---: |
| `GET /payments/{id}/status` | 40 | 5.55 ms | < 500 ms |
| `POST /payments` | 40 | 37.06 ms | < 500 ms |

Esta medición es una referencia reproducible del entorno local; no representa una garantía de latencia de producción.
