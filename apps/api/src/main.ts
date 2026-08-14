import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp, setupSwagger } from './bootstrap.js';
import type { EnvConfig } from './config/env.validation.js';
import { startTracing, stopTracing } from './observability/tracing.js';
import { StructuredLoggerService } from './observability/structured-logger.service.js';

async function bootstrap(): Promise<void> {
  // Module 10 — Observability: tracer provider must be initialized
  // before any instrumented module is imported/instantiated (OTel's
  // auto-instrumentation model relies on this), so this runs before
  // NestFactory.create rather than after.
  startTracing();

  const app = await NestFactory.create(AppModule, {
    // Structured JSON logging (one line per log event on stdout/stderr)
    // replaces Nest's default pretty-printed console logger everywhere,
    // including framework-internal lifecycle logs — see
    // StructuredLoggerService's doc comment for the LOG_LEVEL mapping.
    logger: new StructuredLoggerService(),
    // Module 15 — task #366 (Stripe webhook). Nest's built-in option:
    // attaches the exact raw request bytes as `req.rawBody` alongside the
    // normal parsed `req.body`, for every route — needed because Stripe's
    // webhook signature is computed over the raw payload bytes, and
    // re-serializing the already-parsed JSON body would not reproduce
    // them byte-for-byte (key order, whitespace). No effect on any
    // existing route; nothing else in this codebase reads `req.rawBody`.
    rawBody: true,
  });
  configureApp(app);
  setupSwagger(app);

  const configService = app.get<ConfigService<EnvConfig, true>>(ConfigService);
  const port = configService.get('PORT', { infer: true });

  app.enableShutdownHooks();
  const httpServer = await app.listen(port);
  httpServer.on('close', () => {
    void stopTracing();
  });
}

void bootstrap();
