import { SUPPORT_ENDPOINTS } from "@pentesthub/shared";
import type { CreateSupportTicketRequestDto, SupportTicketDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

// Module 15 — task #355. `public: true` — see SUPPORT_ENDPOINTS.createTicket's
// doc comment for why the intake endpoint has to work for logged-out visitors.
export function createSupportTicket(data: CreateSupportTicketRequestDto) {
  return apiFetch<SupportTicketDto>(SUPPORT_ENDPOINTS.createTicket(), {
    method: "POST",
    body: data,
    public: true,
  });
}

export function getMySupportTickets() {
  return apiFetch<SupportTicketDto[]>(SUPPORT_ENDPOINTS.myTickets());
}
