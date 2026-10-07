import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY = 'allowWithoutLegalAcceptance';

/// Exempts an authenticated route from LegalAcceptanceGuard. Use only for
/// what a user must be able to do before accepting the current legal
/// version: read their own identity, read/accept the legal status, and
/// exercise privacy rights (export, delete account). @Public() routes are
/// never gated in the first place.
export const AllowWithoutLegalAcceptance = () =>
  SetMetadata(ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY, true);
