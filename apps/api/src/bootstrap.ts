import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { EnvConfig } from './config/env.validation.js';

/// Shared between main.ts and the e2e test bootstrap so tests exercise the
/// exact same global pipes/CORS/Swagger config as production, not a
/// hand-copied re-implementation that could drift.
export function configureApp(app: INestApplication): void {
  const configService = app.get<ConfigService<EnvConfig, true>>(ConfigService);

  app.enableCors({
    origin: configService.get('FRONTEND_URL', { infer: true }),
    credentials: true,
  });

  // No global "/api" prefix — must match the paths already committed in
  // packages/shared/src/auth-endpoints.ts (e.g. "/auth/register").
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

export function setupSwagger(app: INestApplication): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('PentestHub AI API')
    .setDescription('Module 1 — Auth. See docs/modules/01-auth.md')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
