"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSubmissionRequestDto,
  UpdateSubmissionStatusRequestDto,
} from "@pentesthub/shared";
import * as submissionsApi from "@/lib/api/submissions";

export const submissionKeys = {
  all: ["bugbounty", "submissions"] as const,
  list: (filter: { programId?: string; findingId?: string; status?: string } = {}) =>
    ["bugbounty", "submissions", "list", filter] as const,
  detail: (id: string) => ["bugbounty", "submissions", "detail", id] as const,
  rewards: ["bugbounty", "rewards"] as const,
};

function useInvalidateSubmissions() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: submissionKeys.all });
}

export function useSubmissions(filter: { programId?: string; findingId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: submissionKeys.list(filter),
    queryFn: () => submissionsApi.listSubmissions(filter),
  });
}

export function useSubmission(id: string) {
  return useQuery({
    queryKey: submissionKeys.detail(id),
    queryFn: () => submissionsApi.getSubmission(id),
    enabled: Boolean(id),
  });
}

export function useCreateSubmission() {
  const invalidate = useInvalidateSubmissions();
  return useMutation({
    mutationFn: (data: CreateSubmissionRequestDto) => submissionsApi.createSubmission(data),
    onSuccess: invalidate,
  });
}

export function useUpdateSubmissionStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateSubmissionStatusRequestDto) =>
      submissionsApi.updateSubmissionStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: submissionKeys.all });
      queryClient.invalidateQueries({ queryKey: submissionKeys.rewards });
    },
  });
}

export function useRewardAnalytics() {
  return useQuery({
    queryKey: submissionKeys.rewards,
    queryFn: () => submissionsApi.getRewardAnalytics(),
  });
}
