"use client";

import { TOOL_TARGET_TYPE_COMPATIBILITY } from "@pentesthub/shared";
import type { ReconTool, TargetType } from "@pentesthub/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/features/i18n/i18n-context";

// Tool names are proper nouns and stay as-is; only the description is
// translated (see the recon.tool.* catalog entries).
const ALL_TOOLS = [
  "SUBFINDER",
  "ASSETFINDER",
  "AMASS",
  "DNSX",
  "NAABU",
  "NMAP",
  "HTTPX",
  "WHATWEB",
  "GOWITNESS",
  "KATANA",
  "GAU",
  "WAYBACKURLS",
  "WHOIS",
  "ASN",
] as const satisfies readonly ReconTool[];

/// Greys out (rather than hides) any tool that doesn't support the
/// target's type — mirrors the server-side check in
/// isToolCompatibleWithTargetType so a user never submits a combination
/// the backend will reject, without needing two different sources of
/// truth for the compatibility rule.
export function ReconToolSelectList({
  targetType,
  selected,
  onChange,
}: {
  targetType: TargetType;
  selected: ReconTool[];
  onChange: (tools: ReconTool[]) => void;
}) {
  const { t } = useI18n();

  function toggle(tool: ReconTool, checked: boolean): void {
    onChange(checked ? [...selected, tool] : selected.filter((t) => t !== tool));
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ALL_TOOLS.map((tool) => {
        const compatible = TOOL_TARGET_TYPE_COMPATIBILITY[tool].includes(targetType);
        return (
          <label
            key={tool}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm data-[disabled]:opacity-40"
            data-disabled={!compatible ? "" : undefined}
          >
            <Checkbox
              checked={selected.includes(tool)}
              disabled={!compatible}
              onCheckedChange={(checked) => toggle(tool, checked === true)}
            />
            <Label className="cursor-pointer font-normal">{t(`recon.tool.${tool}` as const)}</Label>
          </label>
        );
      })}
    </div>
  );
}
