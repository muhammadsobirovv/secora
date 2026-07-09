"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as attachmentsApi from "@/lib/api/attachments";
import type { AttachableType } from "@pentesthub/shared";

function key(attachableType: AttachableType, attachableId: string) {
  return ["attachments", attachableType, attachableId] as const;
}

export function useAttachments(attachableType: AttachableType, attachableId: string) {
  return useQuery({
    queryKey: key(attachableType, attachableId),
    queryFn: () => attachmentsApi.listAttachments(attachableType, attachableId),
    enabled: Boolean(attachableId),
  });
}

export function useUploadAttachment(attachableType: AttachableType, attachableId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => attachmentsApi.uploadAttachment(attachableType, attachableId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(attachableType, attachableId) }),
  });
}

export function useDeleteAttachment(attachableType: AttachableType, attachableId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attachmentsApi.deleteAttachment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(attachableType, attachableId) }),
  });
}
