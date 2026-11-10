import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
export function configureBookingsOpenApi(app: INestApplication): void { const config = new DocumentBuilder().setTitle('StayHub Bookings API').setVersion('1.0.0').addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }).build(); SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config)); }
