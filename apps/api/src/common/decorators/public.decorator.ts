import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/// Opts a route out of the global JwtAuthGuard. The guard is secure-by-
/// default (every route requires a valid access token unless marked
/// @Public()) so a forgotten @UseGuards() can never leave a route open.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
