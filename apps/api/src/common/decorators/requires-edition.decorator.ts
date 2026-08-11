import { SetMetadata } from '@nestjs/common';
import type { Edition } from '@pentesthub/shared';

export const REQUIRES_EDITION_KEY = 'requiresEdition';

/// Module 14 — Edition system. Marks a route (or a whole controller) as
/// gated behind an `Edition` — in practice always `'enterprise'`, since
/// `'community'` is the default every route is already reachable under.
/// Enforced by `EditionGuard` (registered globally in `app.module.ts`,
/// same "no-op unless the decorator is present" posture `RolesGuard`
/// already established for `@Roles(...)`). See
/// `docs/adr/0014-cloud-platform-enterprise-saas-ha.md`.
export const RequiresEdition = (edition: Edition) => SetMetadata(REQUIRES_EDITION_KEY, edition);
