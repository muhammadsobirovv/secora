"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupportTicket, getMySupportTickets } from "@/lib/api/support";

export function useMySupportTickets() {
  return useQuery({
    queryKey: ["support-tickets", "mine"],
    queryFn: getMySupportTickets,
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSupportTicket,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["support-tickets", "mine"] });
    },
  });
}
