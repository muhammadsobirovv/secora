"use client";

import { useQuery } from "@tanstack/react-query";
import * as activityApi from "@/lib/api/activity";
import type { ListActivityQueryDto } from "@pentesthub/shared";

export function useActivity(filter: ListActivityQueryDto = {}) {
  return useQuery({
    queryKey: ["activity", filter],
    queryFn: () => activityApi.listActivity(filter),
  });
}
