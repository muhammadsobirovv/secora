import { Body, Controller, HttpCode, HttpStatus, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { CommandBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { BillingWebhookEventDto } from '../dto/enterprise.dto.js';
import { HandleBillingWebhookCommand } from '../commands/organizations.commands.js';

const SECRET_HEADER = 'x-billing-webhook-secret';

/// Module 14 — Tenant Management / Billing Hooks. `@Public()` (no JWT) —
/// the caller is a billing provider's server, not a logged-in user — but
/// authenticated by a required shared secret instead, checked with
/// `timingSafeEqual` (same posture as every other secret-comparison in
/// this codebase, e.g. `webhook-signature.util.ts`) so response timing
/// doesn't leak how many leading bytes of a guessed secret matched. No
/// specific billing provider (Stripe, Paddle, ...) is wired in by
/// default — a deployment that adds one should normalize that
/// provider's own webhook payload into `BillingWebhookEventDto`'s shape
/// (and additionally verify that provider's own HMAC signature) before
/// or instead of relying on this shared-secret check alone, since a
/// leaked `BILLING_WEBHOOK_SECRET` is the only thing standing between
/// an attacker and forging subscription-status changes.
@ApiTags('enterprise')
@Controller('enterprise/billing')
export class BillingWebhookController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Billing provider webhook receiver — updates the matching organization's subscription state" })
  async receive(
    @Body() event: BillingWebhookEventDto,
    @Headers(SECRET_HEADER) providedSecret: string | undefined,
  ): Promise<void> {
    const configuredSecret = this.configService.get('BILLING_WEBHOOK_SECRET', { infer: true });
    if (!configuredSecret || !providedSecret || !secretsMatch(providedSecret, configuredSecret)) {
      throw new AppException(
        'BILLING_WEBHOOK_UNAUTHORIZED',
        `Missing or invalid ${SECRET_HEADER} header.`,
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.commandBus.execute(new HandleBillingWebhookCommand(event));
  }
}

function secretsMatch(provided: string, configured: string): boolean {
  const providedBuf = Buffer.from(provided);
  const configuredBuf = Buffer.from(configured);
  // Lengths must match before calling timingSafeEqual (it throws on a
  // length mismatch rather than returning false) — comparing against a
  // same-length buffer of zeros first keeps this branch's timing
  // independent of the *provided* secret's length too, not just its
  // content.
  if (providedBuf.length !== configuredBuf.length) {
    timingSafeEqual(Buffer.alloc(configuredBuf.length), configuredBuf);
    return false;
  }
  return timingSafeEqual(providedBuf, configuredBuf);
}
