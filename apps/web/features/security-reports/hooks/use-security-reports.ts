"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GenerateSecurityReportRequestDto } from "@pentesthub/shared";
import * as securityReportsApi from "@/lib/api/security-reports";

export const securityReportKeys = {
  all: ["security-reports"] as const,
  list: ["security-reports", "list"] as const,
  detail: (id: string) => ["security-reports", "detail", id] as const,
};

export function useSecurityReports() {
  return useQuery({
    queryKey: securityReportKeys.list,
    queryFn: () => securityReportsApi.listSecurityReports(),
  });
}

export function useSecurityReport(id: string) {
  return useQuery({
    queryKey: securityReportKeys.detail(id),
    queryFn: () => securityReportsApi.getSecurityReport(id),
    enabled: Boolean(id),
  });
}

export function useGenerateSecurityReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateSecurityReportRequestDto) => securityReportsApi.generateSecurityReport(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: securityReportKeys.all }),
  });
}
