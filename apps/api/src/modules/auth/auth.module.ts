import { Module } from '@nestjs/common';
import { USERS_REPOSITORY } from './domain/repositories/users.repository.interface.js';
import { SESSIONS_REPOSITORY } from './domain/repositories/sessions.repository.interface.js';
import { REFRESH_TOKENS_REPOSITORY } from './domain/repositories/refresh-tokens.repository.interface.js';
import { OAUTH_ACCOUNTS_REPOSITORY } from './domain/repositories/oauth-accounts.repository.interface.js';
import { MFA_REPOSITORY } from './domain/repositories/mfa.repository.interface.js';
import { PASSWORD_RESET_TOKENS_REPOSITORY } from './domain/repositories/password-reset-tokens.repository.interface.js';
import { EMAIL_VERIFICATION_TOKENS_REPOSITORY } from './domain/repositories/email-verification-tokens.repository.interface.js';
import { OAUTH_EXCHANGE_CODES_REPOSITORY } from './domain/repositories/oauth-exchange-codes.repository.interface.js';
import { PrismaUsersRepository } from './infrastructure/persistence/prisma/prisma-users.repository.js';
import { PrismaSessionsRepository } from './infrastructure/persistence/prisma/prisma-sessions.repository.js';
import { PrismaRefreshTokensRepository } from './infrastructure/persistence/prisma/prisma-refresh-tokens.repository.js';
import { PrismaOAuthAccountsRepository } from './infrastructure/persistence/prisma/prisma-oauth-accounts.repository.js';
import { PrismaMfaRepository } from './infrastructure/persistence/prisma/prisma-mfa.repository.js';
import { PrismaPasswordResetTokensRepository } from './infrastructure/persistence/prisma/prisma-password-reset-tokens.repository.js';
import { PrismaEmailVerificationTokensRepository } from './infrastructure/persistence/prisma/prisma-email-verification-tokens.repository.js';
import { PrismaOAuthExchangeCodesRepository } from './infrastructure/persistence/prisma/prisma-oauth-exchange-codes.repository.js';

// Controllers, use-cases, technical services (password hasher, token, totp,
// device-parser), and Passport strategies land here in subsequent tasks —
// see /home/kali/.claude/plans/lucky-spinning-tarjan.md. This module
// currently wires the repository (ports-and-adapters) layer only.
@Module({
  providers: [
    { provide: USERS_REPOSITORY, useClass: PrismaUsersRepository },
    { provide: SESSIONS_REPOSITORY, useClass: PrismaSessionsRepository },
    {
      provide: REFRESH_TOKENS_REPOSITORY,
      useClass: PrismaRefreshTokensRepository,
    },
    {
      provide: OAUTH_ACCOUNTS_REPOSITORY,
      useClass: PrismaOAuthAccountsRepository,
    },
    { provide: MFA_REPOSITORY, useClass: PrismaMfaRepository },
    {
      provide: PASSWORD_RESET_TOKENS_REPOSITORY,
      useClass: PrismaPasswordResetTokensRepository,
    },
    {
      provide: EMAIL_VERIFICATION_TOKENS_REPOSITORY,
      useClass: PrismaEmailVerificationTokensRepository,
    },
    {
      provide: OAUTH_EXCHANGE_CODES_REPOSITORY,
      useClass: PrismaOAuthExchangeCodesRepository,
    },
  ],
  exports: [
    USERS_REPOSITORY,
    SESSIONS_REPOSITORY,
    REFRESH_TOKENS_REPOSITORY,
    OAUTH_ACCOUNTS_REPOSITORY,
    MFA_REPOSITORY,
    PASSWORD_RESET_TOKENS_REPOSITORY,
    EMAIL_VERIFICATION_TOKENS_REPOSITORY,
    OAUTH_EXCHANGE_CODES_REPOSITORY,
  ],
})
export class AuthModule {}
