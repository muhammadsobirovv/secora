import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RbacModule } from '../rbac/rbac.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module.js';
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
import { PasswordHasherService } from './services/password-hasher.service.js';
import { TokenService } from './services/token.service.js';
import { TotpService } from './services/totp.service.js';
import { DeviceParserService } from './services/device-parser.service.js';
import { SessionIssuerService } from './services/session-issuer.service.js';
import { RegisterUseCase } from './use-cases/register.use-case.js';
import { LoginUseCase } from './use-cases/login.use-case.js';
import { MfaChallengeUseCase } from './use-cases/mfa-challenge.use-case.js';
import { RefreshUseCase } from './use-cases/refresh.use-case.js';
import { LogoutUseCase } from './use-cases/logout.use-case.js';
import { ForgotPasswordUseCase } from './use-cases/forgot-password.use-case.js';
import { ResetPasswordUseCase } from './use-cases/reset-password.use-case.js';
import { ChangePasswordUseCase } from './use-cases/change-password.use-case.js';
import { VerifyEmailUseCase } from './use-cases/verify-email.use-case.js';
import { ResendVerificationEmailUseCase } from './use-cases/resend-verification-email.use-case.js';
import { MfaSetupUseCase } from './use-cases/mfa-setup.use-case.js';
import { MfaConfirmUseCase } from './use-cases/mfa-confirm.use-case.js';
import { MfaDisableUseCase } from './use-cases/mfa-disable.use-case.js';
import { OAuthLoginUseCase } from './use-cases/oauth-login.use-case.js';
import { OAuthExchangeUseCase } from './use-cases/oauth-exchange.use-case.js';
import { ListSessionsUseCase } from './use-cases/list-sessions.use-case.js';
import { RevokeSessionUseCase } from './use-cases/revoke-session.use-case.js';
import { GetCurrentUserUseCase } from './use-cases/get-current-user.use-case.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { GoogleStrategy } from './strategies/google.strategy.js';
import { GithubStrategy } from './strategies/github.strategy.js';
import { AuthController } from './controllers/auth.controller.js';
import { PasswordController } from './controllers/password.controller.js';
import { EmailVerificationController } from './controllers/email-verification.controller.js';
import { MfaController } from './controllers/mfa.controller.js';
import { OAuthController } from './controllers/oauth.controller.js';
import { SessionsController } from './controllers/sessions.controller.js';

@Module({
  imports: [
    PassportModule,
    // Empty register(): TokenService passes secret/expiresIn explicitly on
    // every sign() call (from env config), so no module-level default is
    // needed — JwtModule is only imported here to make JwtService injectable.
    JwtModule.register({}),
    RbacModule,
    WorkspacesModule,
    UserPreferencesModule,
  ],
  controllers: [
    AuthController,
    PasswordController,
    EmailVerificationController,
    MfaController,
    OAuthController,
    SessionsController,
  ],
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
    PasswordHasherService,
    TokenService,
    TotpService,
    DeviceParserService,
    SessionIssuerService,
    RegisterUseCase,
    LoginUseCase,
    MfaChallengeUseCase,
    RefreshUseCase,
    LogoutUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    ChangePasswordUseCase,
    VerifyEmailUseCase,
    ResendVerificationEmailUseCase,
    MfaSetupUseCase,
    MfaConfirmUseCase,
    MfaDisableUseCase,
    OAuthLoginUseCase,
    OAuthExchangeUseCase,
    ListSessionsUseCase,
    RevokeSessionUseCase,
    GetCurrentUserUseCase,
    JwtStrategy,
    GoogleStrategy,
    GithubStrategy,
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
    PasswordHasherService,
    TokenService,
    TotpService,
    DeviceParserService,
    RegisterUseCase,
    LoginUseCase,
    MfaChallengeUseCase,
    RefreshUseCase,
    LogoutUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    ChangePasswordUseCase,
    VerifyEmailUseCase,
    ResendVerificationEmailUseCase,
    MfaSetupUseCase,
    MfaConfirmUseCase,
    MfaDisableUseCase,
    OAuthLoginUseCase,
    OAuthExchangeUseCase,
    ListSessionsUseCase,
    RevokeSessionUseCase,
  ],
})
export class AuthModule {}
