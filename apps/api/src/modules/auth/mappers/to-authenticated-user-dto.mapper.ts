import type { AuthenticatedUserDto } from '@pentesthub/shared';
import type { User } from '../../../prisma-types.js';

/// The only place a Prisma User is turned into API output — so
/// passwordHash can never leak into a response by accident.
export function toAuthenticatedUserDto(
  user: User,
  mfaEnabled: boolean,
): AuthenticatedUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? undefined,
    emailVerified: user.emailVerified,
    mfaEnabled,
    createdAt: user.createdAt.toISOString(),
  };
}
