import { Inject, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { AuditService } from '../../audit/audit.service.js';
import { RbacService } from '../../rbac/rbac.service.js';
import {
  ORGANIZATIONS_REPOSITORY,
  type OrganizationsRepository,
} from '../../organizations/domain/repositories/organizations.repository.interface.js';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../../user-preferences/domain/repositories/user-preferences.repository.interface.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  OAUTH_ACCOUNTS_REPOSITORY,
  type OAuthAccountsRepository,
} from '../domain/repositories/oauth-accounts.repository.interface.js';
import {
  OAUTH_EXCHANGE_CODES_REPOSITORY,
  type OAuthExchangeCodesRepository,
} from '../domain/repositories/oauth-exchange-codes.repository.interface.js';
import { TokenService } from '../services/token.service.js';
import { generateUniqueSlug } from '../../../common/utils/slug.js';
import type { OAuthProvider } from '../../../prisma-types.js';

export interface OAuthProfileInput {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  displayName: string;
  accessToken?: string;
  refreshToken?: string;
  ipAddress: string;
  userAgent: string;
}

const OAUTH_EXCHANGE_CODE_TTL_MS = 5 * 60 * 1000;

/// Passport strategies stay thin — they normalize the provider profile and
/// hand it here. This does the account-linking decision + creates a
/// one-time exchange code (see decision 4, docs/adr/0001-auth-module.md);
/// OAuthExchangeUseCase redeems it for real tokens.
@Injectable()
export class OAuthLoginUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(OAUTH_ACCOUNTS_REPOSITORY)
    private readonly oauthAccountsRepository: OAuthAccountsRepository,
    @Inject(OAUTH_EXCHANGE_CODES_REPOSITORY)
    private readonly oauthExchangeCodesRepository: OAuthExchangeCodesRepository,
    @Inject(ORGANIZATIONS_REPOSITORY)
    private readonly organizationsRepository: OrganizationsRepository,
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly userPreferencesRepository: UserPreferencesRepository,
    private readonly rbacService: RbacService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  @Transactional()
  async execute(input: OAuthProfileInput): Promise<{ exchangeCode: string }> {
    const existingAccount =
      await this.oauthAccountsRepository.findByProviderAccount(
        input.provider,
        input.providerUserId,
      );

    let userId: string;
    if (existingAccount) {
      userId = existingAccount.userId;
      await this.auditService.log({
        userId,
        type: 'OAUTH_LOGIN',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } else {
      const existingUserByEmail = await this.usersRepository.findByEmail(
        input.email,
      );
      if (existingUserByEmail) {
        userId = existingUserByEmail.id;
      } else {
        // New account via OAuth — provider already verified this email, so
        // emailVerified starts true and there's no password to set.
        const user = await this.usersRepository.create({
          email: input.email,
          passwordHash: null,
          displayName: input.displayName,
          emailVerified: true,
        });
        userId = user.id;
        await this.rbacService.assignDefaultRole(userId);

        const organization = await this.organizationsRepository.create({
          name: `${input.displayName}'s Workspace`,
          slug: generateUniqueSlug(input.displayName),
        });
        await this.organizationsRepository.addMember(
          organization.id,
          userId,
          'OWNER',
        );
        await this.userPreferencesRepository.createDefault(userId);
      }

      await this.oauthAccountsRepository.create({
        userId,
        provider: input.provider,
        providerUserId: input.providerUserId,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
      });
      await this.auditService.log({
        userId,
        type: 'OAUTH_LINKED',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    }

    const rawCode = this.tokenService.generateOpaqueToken();
    await this.oauthExchangeCodesRepository.create(
      userId,
      this.tokenService.hashOpaqueToken(rawCode),
      new Date(Date.now() + OAUTH_EXCHANGE_CODE_TTL_MS),
    );

    return { exchangeCode: rawCode };
  }
}
