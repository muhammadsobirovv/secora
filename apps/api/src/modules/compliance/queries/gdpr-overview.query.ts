import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  DATA_PROCESSING_REGISTER,
  DATA_SUBJECT_RIGHTS,
  type GdprOverviewDto,
} from '@pentesthub/shared';

/// Module 15 — task #343 "GDPR-ready foundation". Deliberately static: no
/// database lookup, no organization scoping — this is reference/compliance
/// documentation served over the API, not a per-tenant resource. See
/// gdpr.ts in packages/shared for the full rationale and
/// docs/compliance/gdpr-readiness.md for the narrative this backs.
export class GetGdprOverviewQuery implements IQuery {}

@QueryHandler(GetGdprOverviewQuery)
export class GetGdprOverviewHandler implements IQueryHandler<GetGdprOverviewQuery, GdprOverviewDto> {
  execute(): Promise<GdprOverviewDto> {
    return Promise.resolve({
      dataProcessingRegister: DATA_PROCESSING_REGISTER,
      dataSubjectRights: DATA_SUBJECT_RIGHTS,
      breachNotificationProcedure:
        'Secora AI itself does not automate breach notification (this is an operator responsibility that depends on jurisdiction and severity). Operators should: (1) contain and assess the incident, (2) determine if it is a "personal data breach" under applicable law, (3) notify the relevant supervisory authority within the legally required window (72 hours under GDPR Art. 33 where feasible), and (4) notify affected data subjects directly if the breach is likely to result in a high risk to their rights and freedoms (Art. 34). The AuditEvent log and Module 14 observability/logging stack provide the forensic trail needed to scope an incident.',
      crossBorderTransfers:
        'Secora AI is self-hostable — the operator chooses the deployment region and is responsible for any cross-border transfer safeguards (e.g. Standard Contractual Clauses) needed for their specific data residency requirements. The platform does not transfer data to any third-party service by default except: (1) the payment provider configured for billing (e.g. Stripe), and (2) any cloud AI provider (OpenAI/Anthropic/Gemini/OpenRouter) a workspace explicitly opts into via AI privacy mode — LOCAL mode keeps AI processing entirely on-device and avoids this transfer entirely.',
    });
  }
}
