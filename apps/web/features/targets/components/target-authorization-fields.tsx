"use client";

import {
  TARGET_AUTHORIZATION_BASES,
  type AttestTargetAuthorizationRequestDto,
  type TargetAuthorizationBasis,
} from "@pentesthub/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/features/i18n/i18n-context";

export interface TargetAuthorizationValue {
  basis: TargetAuthorizationBasis;
  documentReference: string;
  notes: string;
  /// yyyy-mm-dd from the date input; empty means the 12-month default.
  expiresAt: string;
  attested: boolean;
}

export const EMPTY_TARGET_AUTHORIZATION: TargetAuthorizationValue = {
  basis: "OWNER",
  documentReference: "",
  notes: "",
  expiresAt: "",
  attested: false,
};

/// Maps the form value to the API body; the date input's day becomes the
/// end of that day (UTC) so "valid until <date>" includes the whole day.
export function toAttestRequest(value: TargetAuthorizationValue): AttestTargetAuthorizationRequestDto {
  return {
    basis: value.basis,
    attested: value.attested,
    documentReference: value.documentReference.trim() || undefined,
    notes: value.notes.trim() || undefined,
    expiresAt: value.expiresAt ? new Date(`${value.expiresAt}T23:59:59Z`).toISOString() : undefined,
  };
}

/// Authorization basis + attestation checkbox for a target. Controlled; the
/// caller blocks submission until `value.attested` is true (the API
/// enforces it too).
export function TargetAuthorizationFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: TargetAuthorizationValue;
  onChange: (value: TargetAuthorizationValue) => void;
}) {
  const { t } = useI18n();
  const set = <K extends keyof TargetAuthorizationValue>(key: K, v: TargetAuthorizationValue[K]) =>
    onChange({ ...value, [key]: v });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium">{t("targetAuth.title")}</legend>
      <p className="-mt-1 text-xs text-muted-foreground">{t("targetAuth.description")}</p>

      <div className="flex flex-col gap-2">
        <Label>{t("targetAuth.basis")}</Label>
        <Select value={value.basis} onValueChange={(v) => set("basis", v as TargetAuthorizationBasis)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_AUTHORIZATION_BASES.map((basis) => (
              <SelectItem key={basis} value={basis}>
                {t(`targetAuth.basis.${basis}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-ref`}>{t("targetAuth.documentReference")}</Label>
        <Input
          id={`${idPrefix}-ref`}
          value={value.documentReference}
          maxLength={200}
          onChange={(e) => set("documentReference", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("targetAuth.documentReferenceHint")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-notes`}>{t("targetAuth.notes")}</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={2}
          value={value.notes}
          maxLength={2000}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-expires`}>{t("targetAuth.expiresAt")}</Label>
        <Input
          id={`${idPrefix}-expires`}
          type="date"
          min={today}
          value={value.expiresAt}
          onChange={(e) => set("expiresAt", e.target.value)}
          className="w-fit"
        />
        <p className="text-xs text-muted-foreground">{t("targetAuth.expiresAtHint")}</p>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id={`${idPrefix}-attest`}
          checked={value.attested}
          onCheckedChange={(checked) => set("attested", checked === true)}
          className="mt-0.5"
        />
        <Label htmlFor={`${idPrefix}-attest`} className="text-sm leading-relaxed font-normal">
          {t("targetAuth.attest")}
        </Label>
      </div>
    </fieldset>
  );
}
