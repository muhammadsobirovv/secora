import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import { toDataURL } from 'qrcode';
import { randomBytes } from 'node:crypto';

const ISSUER = 'PentestHub AI';
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
    // epochTolerance allows one 30s step of clock drift either side —
    // otherwise a user's TOTP app being a few seconds ahead/behind rejects
    // every code.
    const result = await verify({ secret, token, epochTolerance: 1 });
    return result.valid;
  }

  generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
    return Array.from({ length: count }, () => randomBytes(5).toString('hex'));
  }
}
