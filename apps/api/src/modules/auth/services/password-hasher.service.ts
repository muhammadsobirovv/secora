import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/// Argon2id per OWASP recommendation — used for both account passwords and
/// MFA backup codes (both are relatively low-entropy, human-facing secrets,
/// unlike the opaque high-entropy tokens TokenService handles).
@Injectable()
export class PasswordHasherService {
  hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, { type: argon2.argon2id });
  }

  verify(hash: string, plaintext: string): Promise<boolean> {
    return argon2.verify(hash, plaintext);
  }
}
