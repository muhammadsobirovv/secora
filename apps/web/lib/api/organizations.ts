// Module 19 — Product Completion, Monetization & Launch Readiness.
//
// The frontend had no way to resolve the current user's `organizationId`
// at all before this file: no API client, no context/hook, and
// `WorkspaceDto` itself carries no `organizationId` field (Organization is
// Module 10's OPTIONAL enterprise multi-tenant layer *above* Workspace —
// a self-hosted/Community user's Workspace may have no Organization).
// Billing/Subscription/Invoice/PaymentMethod are all keyed on
// `organizationId`, not `workspaceId`, so the Billing UI needs this to
// exist first.
//
// `listMyOrganizations()` calls the real, existing, IDOR-safe endpoint
// `GET /enterprise/organizations` (`OrganizationsController.listMine()`),
// which returns only organizations the caller is an active member of —
// verified by reading the controller source during the Module 19 baseline
// audit, not assumed.
import { ORGANIZATION_ENDPOINTS } from "@pentesthub/shared";
import type { OrganizationDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listMyOrganizations() {
  return apiFetch<OrganizationDto[]>(ORGANIZATION_ENDPOINTS.list);
}

export function getOrganization(organizationId: string) {
  return apiFetch<OrganizationDto>(ORGANIZATION_ENDPOINTS.get(organizationId));
}
