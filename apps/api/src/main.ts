import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp, setupSwagger } from './bootstrap.js';
import type { EnvConfig } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  setupSwagger(app);

  const configService = app.get<ConfigService<EnvConfig, true>>(ConfigService);
  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
