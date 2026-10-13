"use client";

import { SCANNER_TARGET_TYPE_COMPATIBILITY } from "@pentesthub/shared";
import type { TargetType, VulnScanner } from "@pentesthub/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/features/i18n/i18n-context";

const ALL_SCANNERS: VulnScanner[] = ["NUCLEI", "FFUF", "DIRSEARCH", "FEROXBUSTER", "NIKTO"];

/// Mirrors ReconToolSelectList exactly: greys out (never hides) a scanner
/// incompatible with the target's type, using the same compatibility map
/// the backend enforces (SCANNER_TARGET_TYPE_COMPATIBILITY), so the user
/// never submits a combination the API will reject.
export function VulnScannerSelectList({
  targetType,
  selected,
  onChange,
}: {
  targetType: TargetType;
  selected: VulnScanner[];
  onChange: (scanners: VulnScanner[]) => void;
}) {
  const { t } = useI18n();

  function toggle(scanner: VulnScanner, checked: boolean): void {
    onChange(checked ? [...selected, scanner] : selected.filter((s) => s !== scanner));
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ALL_SCANNERS.map((scanner) => {
        const compatible = SCANNER_TARGET_TYPE_COMPATIBILITY[scanner].includes(targetType);
        return (
          <label
            key={scanner}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm data-[disabled]:opacity-40"
            data-disabled={!compatible ? "" : undefined}
          >
            <Checkbox
              checked={selected.includes(scanner)}
              disabled={!compatible}
              onCheckedChange={(checked) => toggle(scanner, checked === true)}
            />
            <Label className="cursor-pointer font-normal">{t(`vuln.scanner.${scanner}` as const)}</Label>
          </label>
        );
      })}
    </div>
  );
}
