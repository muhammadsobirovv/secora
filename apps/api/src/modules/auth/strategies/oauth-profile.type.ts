import type { OAuthProvider } from '../../../prisma-types.js';

/// Normalized shape every OAuth strategy's validate() returns, regardless
/// of provider-specific profile fields — the controller/OAuthLoginUseCase
/// never sees a raw Google/GitHub profile object.
export interface OAuthProfileResult {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  displayName: string;
  accessToken?: string;
  refreshToken?: string;
}
