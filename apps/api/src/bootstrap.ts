import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import type { Express, Request, Response } from 'express';
import type { EnvConfig } from './config/env.validation.js';
import { requestIdMiddleware } from './observability/request-id.middleware.js';

/// Shared between main.ts and the e2e test bootstrap so tests exercise the
/// exact same global pipes/CORS/Swagger config as production, not a
/// hand-copied re-implementation that could drift.
export function configureApp(app: INestApplication): void {
  const configService = app.get<ConfigService<EnvConfig, true>>(ConfigService);

  // Module 10 — Security Hardening: a bare `helmet()` (Module 1's
  // original config) applies helmet's default Content-Security-Policy,
  // which is strict enough to break `SwaggerModule.setup()`'s
  // self-hosted Swagger UI page (its bundled JS sets inline `<style>`
  // tags and, depending on the swagger-ui-express version, executes an
  // inline bootstrap `<script>` — both disallowed by the default
  // `script-src 'self'`/`style-src 'self'` directives). Since this is a
  // JSON API, the CSP header is inert on every route except the Swagger
  // UI's own HTML page — browsers only enforce CSP while rendering HTML,
  // and this app returns none anywhere else — so relaxing exactly the
  // two directives Swagger UI needs (`'unsafe-inline'` for style/script)
  // costs nothing on the JSON surface while fixing the one HTML page
  // that exists. `object-src 'none'` and a `frame-ancestors 'none'`
  // clickjacking guard are added explicitly since they have no reason
  // to differ from the strictest possible setting. Deployments that want
  // an even stricter posture should not expose `/api/docs` publicly at
  // all (see docs/deployment's reverse-proxy guidance) rather than
  // relying on CSP alone to protect it.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      // 180 days, applies to subdomains, no `preload` — preload requires
      // submitting the domain to browser vendors' hardcoded HSTS list,
      // which is a one-way door (very slow/impossible to reverse) that
      // this application shouldn't opt a deployment into implicitly.
      hsts: { maxAge: 15_552_000, includeSubDomains: true, preload: false },
      // Explicit `deny` (helmet's own default is the equivalent, but
      // pinning it here documents the decision) — this API serves no
      // content that should ever be framed by another origin.
      frameguard: { action: 'deny' },
    }),
  );
  // Module 14 — API Gateway: response compression. Explicit `filter`
  // (rather than the package default alone) so SSE responses — Module
  // 5/11's AI chat streaming, Module 3/4's live job logs — are never
  // touched even if a future dependency bump changes `compressible`'s
  // (the library `compression` delegates to) classification of
  // `text/event-stream`; compressing a stream that's meant to flush
  // token-by-token would buffer it instead, defeating the entire point
  // of SSE. Falls through to `compression`'s own default filter (which
  // already respects `Cache-Control: no-transform` and skips
  // already-compressed/non-compressible mime types) for everything else.
  app.use(
    compression({
      filter: (req: Request, res: Response) => {
        if (res.getHeader('Content-Type')?.toString().includes('text/event-stream')) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );
  // Module 10 — Observability: assigns/propagates X-Request-Id before
  // anything else runs, so it's available to every guard/interceptor/
  // handler/logger downstream.
  app.use(requestIdMiddleware);

  // See TRUST_PROXY_HOPS in env.validation.ts — sets Express's exact
  // proxy-hop count so req.ip resolves correctly (or is left alone in
  // unproxied local dev, where the default of 0 is correct).
  const trustProxyHops = configService.get('TRUST_PROXY_HOPS', {
    infer: true,
  });
  if (trustProxyHops > 0) {
    const expressInstance = app.getHttpAdapter().getInstance() as Express;
    expressInstance.set('trust proxy', trustProxyHops);
  }

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
    // Module 9/10 — the Public API's machine-to-machine auth
    // (ApiKeyAuthGuard, `X-API-Key` header), used by webhook/API-key
    // consumers and, since Module 10, worker-node register/heartbeat/
    // claim/complete/fail routes. Registering it here just makes Swagger
    // UI's "Authorize" dialog offer it — `@ApiSecurity('apiKey')` on those
    // controllers references this scheme name.
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'apiKey')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
