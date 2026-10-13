"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/features/i18n/i18n-context";
import type { NavItem as NavItemType } from "./nav-config";

export function NavItem({ item }: { item: NavItemType }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const isActive = item.href !== "#" && (pathname === item.href || pathname.startsWith(`${item.href}/`));
  const Icon = item.icon;
  const label = item.i18nKey ? t(item.i18nKey) : item.label;

  if (item.comingSoon) {
    return (
      <div
        className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/50"
        title={t("nav.comingSoon")}
      >
        <Icon className="size-4" />
        <span className="flex-1">{label}</span>
        <Badge variant="outline" className="px-1 py-0 text-[10px] text-muted-foreground/60">
          {t("common.soon")}
        </Badge>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary/15 text-foreground [&_svg]:text-primary"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </Link>
  );
}
