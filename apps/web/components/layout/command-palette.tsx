"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import {
  Activity,
  Building2,
  FileText,
  FolderKanban,
  ImageIcon,
  LayoutDashboard,
  Loader2,
  Search,
  Settings,
  Target,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useUiStore } from "@/lib/stores/ui-store";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useSearch } from "@/features/search/hooks/use-search";
import { useI18n } from "@/features/i18n/i18n-context";
import { cn } from "@/lib/utils";

const STATIC_COMMANDS = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "nav.workspace", href: "/workspace", icon: Building2 },
  { labelKey: "nav.projects", href: "/projects", icon: FolderKanban },
  { labelKey: "nav.targets", href: "/targets", icon: Target },
  { labelKey: "nav.notes", href: "/notes", icon: FileText },
  { labelKey: "nav.evidence", href: "/evidence", icon: ImageIcon },
  { labelKey: "nav.activity", href: "/activity", icon: Activity },
  { labelKey: "nav.settings", href: "/settings/profile", icon: Settings },
] as const;

const RESULT_HREF: Record<string, (id: string, projectId: string | null) => string> = {
  PROJECT: (id) => `/projects/${id}`,
  TARGET: (id) => `/targets/${id}`,
  NOTE: (id) => `/notes/${id}`,
  EVIDENCE: (id) => `/evidence/${id}`,
};

export function CommandPalette() {
  const { t } = useI18n();
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const { data: results, isFetching } = useSearch(debouncedQuery);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <VisuallyHidden>
          <DialogTitle>{t("palette.title")}</DialogTitle>
        </VisuallyHidden>
        <CommandPrimitive shouldFilter={!debouncedQuery} className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted-foreground" />
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder={t("palette.placeholder")}
              className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <CommandPrimitive.List className="max-h-80 overflow-y-auto p-2">
            <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
              {t("palette.empty")}
            </CommandPrimitive.Empty>
            {!debouncedQuery && (
              <CommandPrimitive.Group heading={t("palette.navigate")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground">
                {STATIC_COMMANDS.map((c) => (
                  <CommandItem key={c.href} onSelect={() => go(c.href)}>
                    <c.icon className="size-4" />
                    {t(c.labelKey)}
                  </CommandItem>
                ))}
              </CommandPrimitive.Group>
            )}
            {debouncedQuery && results && results.length > 0 && (
              <CommandPrimitive.Group heading={t("palette.results")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground">
                {results.map((r) => (
                  <CommandItem
                    key={`${r.type}-${r.id}`}
                    onSelect={() => go(RESULT_HREF[r.type]?.(r.id, r.projectId) ?? "/")}
                  >
                    <span className="text-xs text-muted-foreground">{r.type}</span>
                    <span className="truncate">{r.title}</span>
                  </CommandItem>
                ))}
              </CommandPrimitive.Group>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

function CommandItem({
  children,
  onSelect,
  className,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <CommandPrimitive.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        className,
      )}
    >
      {children}
    </CommandPrimitive.Item>
  );
}
