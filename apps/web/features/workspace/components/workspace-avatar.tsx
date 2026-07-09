import { Building2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { WorkspaceDto } from "@pentesthub/shared";

export function WorkspaceAvatar({
  workspace,
  className,
}: {
  workspace: WorkspaceDto | undefined;
  className?: string;
}) {
  return (
    <Avatar className={cn("rounded-lg", className)}>
      <AvatarImage src={workspace?.avatarUrl ?? undefined} alt={workspace?.name} />
      <AvatarFallback className="rounded-lg">
        <Building2 className="size-1/2" />
      </AvatarFallback>
    </Avatar>
  );
}
