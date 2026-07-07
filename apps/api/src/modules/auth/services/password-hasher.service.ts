import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/// Argon2id per OWASP recommendation — used for account passwords only.
/// MFA backup codes are hashed via TokenService.hashOpaqueToken instead:
/// they're high-entropy crypto-random values (not human-chosen secrets),
/// and need a deterministic hash so a presented code can be looked up
/// directly rather than argon2-verified against every unused code.
@Injectable()
export class PasswordHasherService {
  hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, { type: argon2.argon2id });
  }

  verify(hash: string, plaintext: string): Promise<boolean> {
    return argon2.verify(hash, plaintext);
  }
}
