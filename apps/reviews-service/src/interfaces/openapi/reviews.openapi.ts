import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureReviewsOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('StayHub Reviews Service')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
