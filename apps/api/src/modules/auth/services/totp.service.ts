import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import { toDataURL } from 'qrcode';
import { randomBytes } from 'node:crypto';

const ISSUER = 'Secora AI';
const BACKUP_CODE_COUNT = 10;

@Injectable()
export class TotpService {
  generateSecret(): string {
    return generateSecret();
  }

  buildOtpAuthUrl(email: string, secret: string): string {
    return generateURI({ issuer: ISSUER, label: email, secret });
  }

  generateQrCodeDataUrl(otpAuthUrl: string): Promise<string> {
    return toDataURL(otpAuthUrl);
  }

  async verifyCode(secret: string, token: string): Promise<boolean> {
    try {
      // epochTolerance allows one 30s step of clock drift either side —
      // otherwise a user's TOTP app being a few seconds ahead/behind
      // rejects every code.
      const result = await verify({ secret, token, epochTolerance: 1 });
      return result.valid;
    } catch {
      // otplib throws (rather than returning { valid: false }) on
      // malformed input, e.g. a 10-char backup code reaching this instead
      // of the TOTP-shaped 6 digits it expects. Callers that try TOTP
      // before falling back to a backup code (mfa-challenge, mfa-disable)
      // rely on this returning false, not throwing, for any non-match.
      return false;
    }
  }

  generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
    return Array.from({ length: count }, () => randomBytes(5).toString('hex'));
  }
}
