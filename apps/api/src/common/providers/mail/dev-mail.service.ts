import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { MailMessage, MailService } from './mail-service.interface.js';

const OUTBOX_DIR = join(process.cwd(), '.mail-outbox');

/// No real email provider is configured in this environment. Logs the
/// message and writes it to .mail-outbox/*.txt for manual inspection
/// during dev/testing.
@Injectable()
export class DevMailService implements MailService {
  private readonly logger = new Logger(DevMailService.name);

  // See prisma.service.ts for why @Inject(ConfigService) is required here.
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const from = this.configService.get('MAIL_FROM', { infer: true });
    this.logger.log(`[DEV MAIL] to=${message.to} subject="${message.subject}"`);

    await mkdir(OUTBOX_DIR, { recursive: true });
    const filename = `${Date.now()}-${message.to.replace(/[^a-z0-9]/gi, '_')}.txt`;
    const content = [
      `From: ${from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      '',
      message.text,
    ].join('\n');
    await writeFile(join(OUTBOX_DIR, filename), content, 'utf-8');
  }
}
