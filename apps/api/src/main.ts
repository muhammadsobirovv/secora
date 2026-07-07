import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { EnvConfig } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PentestHub AI API')
    .setDescription('Module 1 — Auth. See docs/modules/01-auth.md')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
