import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ROE_LIMITS,
  type CreateRoeRequestDto,
  type RoeAuthorizationDto,
  type RoePublicOutcome,
  type RoePublicRequestDto,
  type RoeStatus,
} from '@pentesthub/shared';
import type { EnvConfig } from '../../config/env.validation.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { MailService } from '../../common/providers/mail/mail-service.interface.js';
import type { StorageService } from '../../common/providers/storage/storage-service.interface.js';
import { MAIL_SERVICE, STORAGE_SERVICE } from '../../common/providers/tokens.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { safeEvidenceName, sniffEvidence } from './roe-evidence.js';
import {
  buildApprovalEmail,
  buildConfirmationEmail,
  buildRequesterNotice,
  oneLine,
  type RoeMailDetails,
} from './roe-mail.js';
import { RoeRuleError, normalizeAssets, validateClientEmail, validateWindow, type NormalizedAsset } from './roe-rules.js';
import { generateRoeToken, hashRoeToken, looksLikeRoeToken } from './roe-token.js';

export interface RoeRequester {
  id: string;
  email: string;
  displayName: string;
}

export interface RoeRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface RoeEvidenceUpload {
  buffer: Buffer;
  originalname: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/// The same answer for every link that does not work (never existed, already
/// used, expired, withdrawn): it must not tell a guesser anything.
const LINK_INVALID = 'This link is no longer valid.';

type RoeRow = NonNullable<Awaited<ReturnType<PrismaService['roeAuthorization']['findUnique']>>>;
type RoeRowWithAssets = RoeRow & {
  assets: Array<{ id: string; type: string; value: string; host: string; wildcard: boolean }>;
};

/// Client engagement ("rules of engagement") authorizations: request, send the
/// client a single-use approval link, record their decision, and let them
/// withdraw it later. What an approved engagement allows is decided in
/// RoeCoverageService; this class never starts a scan.
@Injectable()
export class RoeAuthorizationService {
  private readonly logger = new Logger(RoeAuthorizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(ConfigService)
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  // -------------------------------------------------------------------------
  // Requester side
  // -------------------------------------------------------------------------

  async create(input: {
    requester: RoeRequester;
    workspaceId: string;
    data: CreateRoeRequestDto;
    evidence?: RoeEvidenceUpload;
    context?: RoeRequestContext;
    now?: Date;
  }): Promise<RoeAuthorizationDto> {
    const now = input.now ?? new Date();
    const { data, requester } = input;

    if (data.responsibilityAccepted !== true) {
      throw new AppException(
        'ROE_INVALID_REQUEST',
        'Confirm that you take responsibility for this authorization being genuine.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const clientName = this.requiredText(data.clientName, ROE_LIMITS.clientNameMax, 'client or organisation name');
    const signatoryName = this.requiredText(data.signatoryName, ROE_LIMITS.personNameMax, 'signatory name');
    const signatoryRole = this.requiredText(data.signatoryRole, ROE_LIMITS.roleMax, 'signatory role');

    let assets: NormalizedAsset[];
    let email: { email: string; domain: string };
    let window: { start: Date; end: Date };
    try {
      assets = normalizeAssets(data.assets);
      email = validateClientEmail(data.clientEmail, assets, requester.email);
      window = validateWindow(data.windowStart, data.windowEnd, now);
    } catch (error) {
      throw this.fromRuleError(error);
    }

    let evidenceMeta: { mime: string; name: string; size: number; sha256: string; buffer: Buffer } | null = null;
    if (input.evidence) {
      const checked = sniffEvidence(input.evidence.buffer, input.evidence.originalname);
      if (!checked.ok) {
        throw new AppException(
          'ROE_INVALID_EVIDENCE',
          checked.reason === 'TOO_LARGE'
            ? `The evidence file is too large (at most ${ROE_LIMITS.evidenceMaxBytes / (1024 * 1024)} MB).`
            : checked.reason === 'EMPTY'
              ? 'The evidence file is empty.'
              : 'Attach a signed PDF, a PNG or JPEG image, or a saved .eml email.',
          HttpStatus.BAD_REQUEST,
        );
      }
      evidenceMeta = {
        mime: checked.evidence.mime,
        name: safeEvidenceName(input.evidence.originalname, checked.evidence.extension),
        size: input.evidence.buffer.length,
        sha256: createHash('sha256').update(input.evidence.buffer).digest('hex'),
        buffer: input.evidence.buffer,
      };
    }

    await this.assertCanSendEmail({ userId: requester.id, recipient: email.email, now, countPending: true });

    const token = generateRoeToken();
    const id = randomUUID();
    let evidenceKey: string | null = null;
    if (evidenceMeta) {
      evidenceKey = `roe/${id}/${randomBytes(16).toString('hex')}`;
      await this.storage.upload(evidenceKey, evidenceMeta.buffer, evidenceMeta.mime);
    }

    const row = await this.prisma.roeAuthorization.create({
      data: {
        id,
        workspaceId: input.workspaceId,
        requestedBy: requester.id,
        clientName,
        clientEmail: email.email,
        clientEmailDomain: email.domain,
        signatoryName,
        signatoryRole,
        windowStart: window.start,
        windowEnd: window.end,
        status: 'PENDING',
        tokenHash: hashRoeToken(token),
        tokenExpiresAt: new Date(now.getTime() + ROE_LIMITS.tokenTtlDays * DAY),
        evidenceKey,
        evidenceName: evidenceMeta?.name ?? null,
        evidenceMime: evidenceMeta?.mime ?? null,
        evidenceSize: evidenceMeta?.size ?? null,
        evidenceSha256: evidenceMeta?.sha256 ?? null,
        responsibilityAcceptedAt: now,
        assets: {
          create: assets.map((asset) => ({
            type: asset.type,
            value: asset.value,
            host: asset.host,
            wildcard: asset.wildcard,
          })),
        },
      },
      include: { assets: true },
    });

    await this.audit(requester.id, 'ROE_REQUESTED', input.context, {
      roeId: row.id,
      workspaceId: row.workspaceId,
      assetCount: row.assets.length,
      clientEmailDomain: row.clientEmailDomain,
      windowStart: row.windowStart.toISOString(),
      windowEnd: row.windowEnd.toISOString(),
      hasEvidence: evidenceKey !== null,
    });

    try {
      await this.sendApprovalEmail(row, requester, token, now);
    } catch (error) {
      // The request is useless without the email: withdraw it and say so.
      await this.prisma.roeAuthorization.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      this.logger.warn(`ROE approval email for ${row.id} failed: ${String(error)}`);
      throw new AppException(
        'ROE_EMAIL_FAILED',
        'The approval email could not be sent. Try again in a few minutes.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return this.toDto(row, now);
  }

  async list(userId: string, now = new Date()): Promise<RoeAuthorizationDto[]> {
    const rows = await this.prisma.roeAuthorization.findMany({
      where: { requestedBy: userId },
      include: { assets: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.toDto(row, now));
  }

  async get(userId: string, id: string, now = new Date()): Promise<RoeAuthorizationDto> {
    return this.toDto(await this.loadOwned(userId, id), now);
  }

  async resend(input: {
    requester: RoeRequester;
    id: string;
    context?: RoeRequestContext;
    now?: Date;
  }): Promise<RoeAuthorizationDto> {
    const now = input.now ?? new Date();
    const row = await this.loadOwned(input.requester.id, input.id);
    if (row.status !== 'PENDING' || row.windowEnd <= now || row.tokenUsedAt) {
      throw new AppException('ROE_NOT_PENDING', 'Only a request that is still waiting for the client can be sent again.', HttpStatus.CONFLICT);
    }
    const next = this.resendAvailableAt(row);
    if (next && next > now) {
      throw new AppException(
        'ROE_RESEND_COOLDOWN',
        `Wait until ${next.toISOString()} before sending the email again.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.assertCanSendEmail({ userId: input.requester.id, recipient: row.clientEmail, now, countPending: false });

    // A new link replaces the old one, which stops working.
    const token = generateRoeToken();
    const updated = await this.prisma.roeAuthorization.updateMany({
      where: { id: row.id, status: 'PENDING', tokenUsedAt: null },
      data: {
        tokenHash: hashRoeToken(token),
        tokenExpiresAt: new Date(now.getTime() + ROE_LIMITS.tokenTtlDays * DAY),
        lastEmailAt: now,
      },
    });
    if (updated.count === 0) {
      throw new AppException('ROE_NOT_PENDING', 'Only a request that is still waiting for the client can be sent again.', HttpStatus.CONFLICT);
    }
    const fresh = await this.loadOwned(input.requester.id, input.id);
    try {
      await this.sendApprovalEmail(fresh, input.requester, token, now);
    } catch (error) {
      this.logger.warn(`ROE approval email for ${row.id} failed: ${String(error)}`);
      throw new AppException('ROE_EMAIL_FAILED', 'The approval email could not be sent. Try again in a few minutes.', HttpStatus.BAD_GATEWAY);
    }
    return this.toDto(fresh, now);
  }

  /// Requester withdraws a request that is still waiting, or ends an approved
  /// engagement early. Either way, no scan can start under it afterwards and a
  /// running one stops at its next check.
  async cancel(input: { userId: string; id: string; context?: RoeRequestContext; now?: Date }): Promise<RoeAuthorizationDto> {
    const now = input.now ?? new Date();
    const row = await this.loadOwned(input.userId, input.id);
    const result = await this.prisma.roeAuthorization.updateMany({
      where: { id: row.id, status: { in: ['PENDING', 'ACTIVE'] } },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    if (result.count === 0) {
      throw new AppException('ROE_NOT_PENDING', 'This request can no longer be cancelled.', HttpStatus.CONFLICT);
    }
    await this.audit(input.userId, 'ROE_CANCELLED', input.context, { roeId: row.id, workspaceId: row.workspaceId, wasStatus: row.status });
    return this.toDto(await this.loadOwned(input.userId, input.id), now);
  }

  async evidence(userId: string, id: string): Promise<{ data: Buffer; name: string; mime: string }> {
    const row = await this.loadOwned(userId, id);
    if (!row.evidenceKey || !row.evidenceName || !row.evidenceMime) {
      throw new AppException('ROE_NOT_FOUND', 'No evidence was attached.', HttpStatus.NOT_FOUND);
    }
    return { data: await this.storage.download(row.evidenceKey), name: row.evidenceName, mime: row.evidenceMime };
  }

  // -------------------------------------------------------------------------
  // Client side (public, no login). Opening a link only reads; every decision
  // is a POST, so a mail scanner or link preview can never approve.
  // -------------------------------------------------------------------------

  async getForClient(token: string, now = new Date()): Promise<RoePublicRequestDto> {
    const found = await this.findByToken(token, now);
    if (!found) this.linkInvalid();
    return this.toPublic(found.row, found.kind);
  }

  async approve(token: string, context: RoeRequestContext, now = new Date()): Promise<RoePublicOutcome> {
    return this.decide(token, 'APPROVED', context, now);
  }

  async decline(token: string, context: RoeRequestContext, now = new Date()): Promise<RoePublicOutcome> {
    return this.decide(token, 'DECLINED', context, now);
  }

  async revoke(token: string, context: RoeRequestContext, now = new Date()): Promise<RoePublicOutcome> {
    if (!looksLikeRoeToken(token)) this.linkInvalid();
    const hash = hashRoeToken(token);
    const row = await this.prisma.roeAuthorization.findUnique({
      where: { revokeTokenHash: hash },
      include: { assets: true },
    });
    if (!row || row.status !== 'ACTIVE') this.linkInvalid();
    const result = await this.prisma.roeAuthorization.updateMany({
      where: { id: row.id, revokeTokenHash: hash, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revokedIp: context.ipAddress ?? null,
        revokedUserAgent: context.userAgent?.slice(0, 300) ?? null,
        // Used up: the same link cannot be replayed.
        revokeTokenHash: null,
      },
    });
    if (result.count === 0) this.linkInvalid();
    await this.audit(row.requestedBy, 'ROE_REVOKED', context, { roeId: row.id, workspaceId: row.workspaceId });
    await this.notifyRequester(row, 'REVOKED');
    return 'REVOKED';
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private async decide(
    token: string,
    outcome: 'APPROVED' | 'DECLINED',
    context: RoeRequestContext,
    now: Date,
  ): Promise<RoePublicOutcome> {
    if (!looksLikeRoeToken(token)) this.linkInvalid();
    const hash = hashRoeToken(token);
    const revokeToken = outcome === 'APPROVED' ? generateRoeToken() : null;
    const ip = context.ipAddress ?? null;
    const ua = context.userAgent?.slice(0, 300) ?? null;

    // One atomic step decides whether this click is the one that counts: it
    // only matches a request that is still PENDING, whose link is unused,
    // unexpired and whose test window has not already ended.
    const result = await this.prisma.roeAuthorization.updateMany({
      where: {
        tokenHash: hash,
        status: 'PENDING',
        tokenUsedAt: null,
        tokenExpiresAt: { gt: now },
        windowEnd: { gt: now },
      },
      data:
        outcome === 'APPROVED'
          ? {
              status: 'ACTIVE',
              tokenUsedAt: now,
              approvedAt: now,
              approvedIp: ip,
              approvedUserAgent: ua,
              revokeTokenHash: hashRoeToken(revokeToken as string),
            }
          : {
              status: 'DECLINED',
              tokenUsedAt: now,
              declinedAt: now,
              declinedIp: ip,
              declinedUserAgent: ua,
            },
    });
    if (result.count === 0) this.linkInvalid();

    const row = await this.prisma.roeAuthorization.findUnique({ where: { tokenHash: hash }, include: { assets: true } });
    if (!row) return outcome;
    await this.audit(row.requestedBy, outcome === 'APPROVED' ? 'ROE_APPROVED' : 'ROE_DECLINED', context, {
      roeId: row.id,
      workspaceId: row.workspaceId,
      clientEmailDomain: row.clientEmailDomain,
    });

    // The decision is already recorded; a mail problem must not undo it.
    const details = await this.mailDetails(row);
    try {
      await this.mail.send(
        buildConfirmationEmail(
          details,
          row.clientEmail,
          outcome,
          revokeToken ? this.link('revoke', revokeToken) : null,
        ),
      );
    } catch (error) {
      this.logger.warn(`ROE confirmation email for ${row.id} failed: ${String(error)}`);
    }
    await this.notifyRequester(row, outcome);
    return outcome;
  }

  private async notifyRequester(row: RoeRowWithAssets, outcome: 'APPROVED' | 'DECLINED' | 'REVOKED'): Promise<void> {
    try {
      const details = await this.mailDetails(row);
      await this.mail.send(buildRequesterNotice(details, details.requesterEmail, outcome, `${this.frontend()}/authorizations`));
    } catch (error) {
      this.logger.warn(`ROE requester notice for ${row.id} failed: ${String(error)}`);
    }
  }

  private async findByToken(
    token: string,
    now: Date,
  ): Promise<{ row: RoeRowWithAssets; kind: 'APPROVAL' | 'REVOKE' } | null> {
    if (!looksLikeRoeToken(token)) return null;
    const hash = hashRoeToken(token);
    const approval = await this.prisma.roeAuthorization.findUnique({ where: { tokenHash: hash }, include: { assets: true } });
    if (approval && approval.status === 'PENDING' && !approval.tokenUsedAt && approval.tokenExpiresAt > now && approval.windowEnd > now) {
      return { row: approval, kind: 'APPROVAL' };
    }
    const revoke = await this.prisma.roeAuthorization.findUnique({ where: { revokeTokenHash: hash }, include: { assets: true } });
    if (revoke && revoke.status === 'ACTIVE' && revoke.windowEnd > now) return { row: revoke, kind: 'REVOKE' };
    return null;
  }

  private async mailDetails(row: RoeRowWithAssets): Promise<RoeMailDetails & { requesterEmail: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: row.requestedBy },
      select: { email: true, displayName: true },
    });
    return {
      requesterName: user?.displayName ?? 'A Secora user',
      requesterEmail: user?.email ?? 'unknown',
      clientName: row.clientName,
      assets: row.assets.map((a) => ({ type: a.type, value: a.value, wildcard: a.wildcard })),
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      signatoryName: row.signatoryName,
      signatoryRole: row.signatoryRole,
    };
  }

  private async toPublicFor(row: RoeRowWithAssets, kind: 'APPROVAL' | 'REVOKE'): Promise<RoePublicRequestDto> {
    const details = await this.mailDetails(row);
    return {
      kind,
      requesterName: oneLine(details.requesterName, 120),
      requesterEmail: oneLine(details.requesterEmail, 254),
      clientName: row.clientName,
      assets: row.assets.map((a) => ({ type: a.type as 'DOMAIN' | 'SUBDOMAIN' | 'URL', value: a.value, wildcard: a.wildcard })),
      windowStart: row.windowStart.toISOString(),
      windowEnd: row.windowEnd.toISOString(),
      signatoryName: row.signatoryName,
      signatoryRole: row.signatoryRole,
    };
  }

  private toPublic(row: RoeRowWithAssets, kind: 'APPROVAL' | 'REVOKE'): Promise<RoePublicRequestDto> {
    return this.toPublicFor(row, kind);
  }

  private async sendApprovalEmail(row: RoeRowWithAssets, requester: RoeRequester, token: string, now: Date): Promise<void> {
    const details: RoeMailDetails = {
      requesterName: requester.displayName,
      requesterEmail: requester.email,
      clientName: row.clientName,
      assets: row.assets.map((a) => ({ type: a.type, value: a.value, wildcard: a.wildcard })),
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      signatoryName: row.signatoryName,
      signatoryRole: row.signatoryRole,
    };
    await this.mail.send(buildApprovalEmail(details, row.clientEmail, this.link('approve', token)));
    await this.prisma.roeEmailEvent.create({
      data: { authorizationId: row.id, userId: requester.id, recipient: row.clientEmail, kind: 'APPROVAL' },
    });
    await this.prisma.roeAuthorization.updateMany({ where: { id: row.id }, data: { lastEmailAt: now } });
    await this.audit(requester.id, 'ROE_EMAIL_SENT', undefined, {
      roeId: row.id,
      workspaceId: row.workspaceId,
      recipientDomain: row.clientEmailDomain,
    });
  }

  /// The sending limits: pending requests per user, emails per user per hour,
  /// emails per recipient address per day. Counted from stored events, so they
  /// hold across restarts and several API instances.
  private async assertCanSendEmail(input: {
    userId: string;
    recipient: string;
    now: Date;
    countPending: boolean;
  }): Promise<void> {
    if (input.countPending) {
      const pending = await this.prisma.roeAuthorization.count({
        where: { requestedBy: input.userId, status: 'PENDING', tokenExpiresAt: { gt: input.now }, windowEnd: { gt: input.now } },
      });
      if (pending >= ROE_LIMITS.maxPendingPerUser) {
        throw new AppException(
          'ROE_TOO_MANY_PENDING',
          `You already have ${ROE_LIMITS.maxPendingPerUser} requests waiting for a client. Cancel one or wait for an answer.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const lastHour = await this.prisma.roeEmailEvent.count({
      where: { userId: input.userId, createdAt: { gt: new Date(input.now.getTime() - HOUR) } },
    });
    if (lastHour >= ROE_LIMITS.maxEmailsPerUserPerHour) {
      throw new AppException('ROE_RATE_LIMITED', 'You have sent too many approval emails this hour. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const recipientToday = await this.prisma.roeEmailEvent.count({
      where: { recipient: input.recipient, createdAt: { gt: new Date(input.now.getTime() - DAY) } },
    });
    if (recipientToday >= ROE_LIMITS.maxEmailsPerRecipientPerDay) {
      throw new AppException(
        'ROE_RATE_LIMITED',
        'This address has already received the maximum number of approval emails today. Try again tomorrow.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private resendAvailableAt(row: Pick<RoeRow, 'lastEmailAt' | 'createdAt'>): Date | null {
    const last = row.lastEmailAt ?? row.createdAt;
    return new Date(last.getTime() + ROE_LIMITS.resendCooldownMinutes * MINUTE);
  }

  private async loadOwned(userId: string, id: string): Promise<RoeRowWithAssets> {
    const row = await this.prisma.roeAuthorization.findUnique({ where: { id }, include: { assets: true } });
    // Someone else's id looks exactly like a missing one.
    if (!row || row.requestedBy !== userId) {
      throw new AppException('ROE_NOT_FOUND', 'Authorization not found.', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  private effectiveStatus(row: RoeRow, now: Date): RoeStatus {
    if (row.status === 'ACTIVE' && row.windowEnd <= now) return 'EXPIRED';
    if (row.status === 'PENDING' && (row.tokenExpiresAt <= now || row.windowEnd <= now)) return 'EXPIRED';
    return row.status;
  }

  private toDto(row: RoeRowWithAssets, now: Date): RoeAuthorizationDto {
    const status = this.effectiveStatus(row, now);
    const waiting = row.status === 'PENDING' && row.windowEnd > now && !row.tokenUsedAt;
    return {
      id: row.id,
      status,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      assets: row.assets.map((a) => ({
        id: a.id,
        type: a.type as 'DOMAIN' | 'SUBDOMAIN' | 'URL',
        value: a.value,
        host: a.host,
        wildcard: a.wildcard,
      })),
      windowStart: row.windowStart.toISOString(),
      windowEnd: row.windowEnd.toISOString(),
      signatoryName: row.signatoryName,
      signatoryRole: row.signatoryRole,
      hasEvidence: !!row.evidenceKey,
      evidenceName: row.evidenceName,
      evidenceSize: row.evidenceSize,
      createdAt: row.createdAt.toISOString(),
      approvedAt: row.approvedAt?.toISOString() ?? null,
      tokenExpiresAt: waiting ? row.tokenExpiresAt.toISOString() : null,
      lastEmailAt: row.lastEmailAt?.toISOString() ?? null,
      canResendAt: waiting ? this.resendAvailableAt(row)?.toISOString() ?? null : null,
    };
  }

  private requiredText(value: unknown, max: number, label: string): string {
    const text = typeof value === 'string' ? oneLine(value, max + 1) : '';
    if (!text) throw new AppException('ROE_INVALID_REQUEST', `Enter the ${label}.`, HttpStatus.BAD_REQUEST);
    if (text.length > max) {
      throw new AppException('ROE_INVALID_REQUEST', `The ${label} can be at most ${max} characters.`, HttpStatus.BAD_REQUEST);
    }
    return text;
  }

  private fromRuleError(error: unknown): unknown {
    if (error instanceof RoeRuleError) {
      return new AppException(error.code, error.message, HttpStatus.BAD_REQUEST);
    }
    return error;
  }

  private link(kind: 'approve' | 'revoke', token: string): string {
    return `${this.frontend()}/roe/${kind}/${token}`;
  }

  private frontend(): string {
    return this.config.get('FRONTEND_URL', { infer: true }).replace(/\/+$/, '');
  }

  private linkInvalid(): never {
    throw new AppException('ROE_LINK_INVALID', LINK_INVALID, HttpStatus.NOT_FOUND);
  }

  private audit(
    userId: string,
    type:
      | 'ROE_REQUESTED'
      | 'ROE_EMAIL_SENT'
      | 'ROE_APPROVED'
      | 'ROE_DECLINED'
      | 'ROE_REVOKED'
      | 'ROE_CANCELLED',
    context: RoeRequestContext | undefined,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.auditService.log({
      userId,
      type,
      ipAddress: context?.ipAddress ?? 'internal',
      userAgent: context?.userAgent?.slice(0, 300) ?? 'api',
      metadata,
    });
  }
}
