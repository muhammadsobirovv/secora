"use client";

import Link from "next/link";
import { Building2, ChevronsUpDown, Plus, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/features/workspace/hooks/use-workspace";
import { useI18n } from "@/features/i18n/i18n-context";

export function WorkspaceSwitcher() {
  const { t } = useI18n();
  const { data: workspace, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-4 w-28" />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="size-7 rounded-md">
          <AvatarImage src={workspace?.avatarUrl ?? undefined} alt={workspace?.name} />
          <AvatarFallback className="rounded-md">
            <Building2 className="size-3.5" />
          </AvatarFallback>
        </Avatar>
        <span className="flex-1 truncate">{workspace?.name ?? t("workspaceSwitcher.fallbackName")}</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("workspaceSwitcher.yours")}</DropdownMenuLabel>
        <DropdownMenuItem disabled className="opacity-100">
          <Avatar className="size-5 rounded">
            <AvatarImage src={workspace?.avatarUrl ?? undefined} alt={workspace?.name} />
            <AvatarFallback className="rounded text-[10px]">
              <Building2 className="size-3" />
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{workspace?.name}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/workspace">
            <Settings className="size-4" />
            {t("workspaceSwitcher.settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Plus className="size-4" />
          {t("workspaceSwitcher.add")}
          <span className="ml-auto text-xs text-muted-foreground">{t("common.soon")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
