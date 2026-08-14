import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../exceptions/app.exception.js';
import type { MailMessage, MailService } from './mail-service.interface.js';

/// Module 15 — Integrations (task #338). Closes the one real gap the
/// notification-dispatcher research turned up: `NotificationDispatcherService`'s
/// `EMAIL` case (apps/api/src/modules/notifications-channels/services/
/// notification-dispatcher.service.ts) has always been an honest no-op
/// ("No email provider configured") because `MAIL_SERVICE` only ever bound
/// to `DevMailService` (writes to `.mail-outbox/`, Module 1). This is the
/// real provider that binding was always meant to grow into — any
/// standard SMTP relay (self-hosted Postfix, MailHog for local dev — still
/// free — or a paid SendGrid/SES/Postmark SMTP endpoint if a deployment
/// wants one). Selected via `MAIL_PROVIDER=smtp` in `providers.module.ts`,
/// same `useFactory` pattern Module 14 established for storage/queue/cache.
/// Never the Community Edition default — CE keeps booting with zero
/// configuration via `DevMailService` unless an operator opts in.
///
/// Sandbox disclosure: `nodemailer` is a *declared* dependency
/// (package.json) written against its real, stable public API from
/// training-time knowledge — this sandbox cannot `pnpm install` it (no
/// registry access) or reach a real SMTP relay to exercise it against, so
/// this class has not been executed here. Same disclosed-but-real posture
/// as `S3CompatibleStorageService`/`RedisQueueService`/`RedisCacheService`
/// (Module 14) and `@opentelemetry/*` (Module 10) before it.
@Injectable()
export class SmtpMailService implements MailService {
  private readonly logger = new Logger(SmtpMailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    const host = this.configService.get('SMTP_HOST', { infer: true });
    if (!host) {
      throw new AppException(
        'MAIL_PROVIDER_NOT_CONFIGURED',
        'MAIL_PROVIDER=smtp requires SMTP_HOST to be set (and, if the relay requires auth, SMTP_USER/SMTP_PASSWORD).',
        500,
      );
    }
    const user = this.configService.get('SMTP_USER', { infer: true });
    const password = this.configService.get('SMTP_PASSWORD', { infer: true });
    this.from = this.configService.get('MAIL_FROM', { infer: true });
    this.transporter = createTransport({
      host,
      port: this.configService.get('SMTP_PORT', { infer: true }),
      secure: this.configService.get('SMTP_SECURE', { infer: true }),
      auth: user && password ? { user, pass: password } : undefined,
    });
    this.logger.log(`SMTP mail configured: host=${host} port=${this.configService.get('SMTP_PORT', { infer: true })}`);
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    } catch (error) {
      // Mirrors NotificationDispatcherService's "channel failures are
      // reported, never thrown into the caller's write transaction"
      // posture — a down SMTP relay must not fail e.g. registration.
      this.logger.error(
        `Failed to send mail to ${message.to}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new AppException('MAIL_DELIVERY_FAILED', 'Failed to send email via the configured SMTP relay.', 502);
    }
  }
}
