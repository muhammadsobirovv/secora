import type { CreateRoeRequestDto, RoeAssetInputDto } from "@pentesthub/shared";
import { parseScanInput } from "./parse-scan-input.ts";

/// Pure helpers behind the "I'm testing for a client" form, kept out of the
/// component so they can be tested without a browser.

export type AssetRowError = "empty" | "ip" | "invalid";

export interface AssetRow {
  text: string;
  wildcard: boolean;
}

export type ParsedAssetRow =
  | { ok: true; asset: RoeAssetInputDto }
  | { ok: false; error: AssetRowError };

/// One scope row as typed: "acme.example", "*.acme.example" or a full URL.
/// IP addresses are refused here with their own message; the server refuses
/// them too. A URL never carries the wildcard flag.
export function parseAssetRow(row: AssetRow): ParsedAssetRow {
  const raw = row.text.trim();
  if (raw === "") return { ok: false, error: "empty" };
  const star = raw.startsWith("*.");
  const parsed = parseScanInput(star ? raw.slice(2) : raw);
  if (!parsed) return { ok: false, error: "invalid" };
  if (parsed.type === "IP_ADDRESS") return { ok: false, error: "ip" };
  if (parsed.type === "URL") {
    return { ok: true, asset: { type: "URL", value: parsed.value, wildcard: false } };
  }
  return { ok: true, asset: { type: "DOMAIN", value: parsed.value, wildcard: star || row.wildcard } };
}

/// All rows at once: the assets, and the first error per row index.
export function parseAssetRows(rows: AssetRow[]): { assets: RoeAssetInputDto[]; errors: Map<number, AssetRowError> } {
  const assets: RoeAssetInputDto[] = [];
  const errors = new Map<number, AssetRowError>();
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const parsed = parseAssetRow(row);
    if (!parsed.ok) {
      // A trailing empty row is just the "add another" slot.
      if (!(parsed.error === "empty" && rows.length > 1)) errors.set(index, parsed.error);
      return;
    }
    const key = `${parsed.asset.type}|${parsed.asset.value}|${parsed.asset.wildcard ? 1 : 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    assets.push(parsed.asset);
  });
  if (assets.length === 0 && errors.size === 0) errors.set(0, "empty");
  return { assets, errors };
}

const pad = (n: number) => String(n).padStart(2, "0");

/// <input type="datetime-local"> value (local time, no zone) for a Date.
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/// A datetime-local value read as local time and turned into an ISO instant.
export function fromLocalInput(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/// Starts now, ends in 14 days: the common case for a short engagement.
export function defaultWindow(now: Date): { start: string; end: string } {
  return { start: toLocalInput(now), end: toLocalInput(new Date(now.getTime() + 14 * 86_400_000)) };
}

export const ROE_MAX_WINDOW_DAYS = 90;

/// Cheap client-side check of the window; the server is the authority.
export function windowProblem(startLocal: string, endLocal: string, now: Date): "invalid" | "order" | "past" | "tooLong" | null {
  const start = new Date(startLocal).getTime();
  const end = new Date(endLocal).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "invalid";
  if (end <= start) return "order";
  if (end <= now.getTime()) return "past";
  if (end - start > ROE_MAX_WINDOW_DAYS * 86_400_000) return "tooLong";
  return null;
}

/// Whether a client mailbox could ever be allowed for these assets: its domain
/// must equal an asset's registrable domain or sit below it. A rough mirror of
/// the server rule (which has the public-suffix list) used only to warn early.
export function emailLooksValid(email: string): boolean {
  return /^[^\s@]{1,64}@([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(email.trim());
}

export interface RoeFormValues {
  clientName: string;
  clientEmail: string;
  rows: AssetRow[];
  windowStart: string;
  windowEnd: string;
  signatoryName: string;
  signatoryRole: string;
  responsibilityAccepted: boolean;
}

/// The request body, or null while the form is not complete.
export function toRequestBody(values: RoeFormValues, now: Date): CreateRoeRequestDto | null {
  const { assets, errors } = parseAssetRows(values.rows);
  if (errors.size > 0 || assets.length === 0) return null;
  if (windowProblem(values.windowStart, values.windowEnd, now)) return null;
  const start = fromLocalInput(values.windowStart);
  const end = fromLocalInput(values.windowEnd);
  if (!start || !end) return null;
  if (!values.clientName.trim() || !emailLooksValid(values.clientEmail)) return null;
  if (!values.signatoryName.trim() || !values.signatoryRole.trim()) return null;
  if (!values.responsibilityAccepted) return null;
  return {
    clientName: values.clientName.trim(),
    clientEmail: values.clientEmail.trim(),
    assets,
    windowStart: start,
    windowEnd: end,
    signatoryName: values.signatoryName.trim(),
    signatoryRole: values.signatoryRole.trim(),
    responsibilityAccepted: true,
  };
}

/// File types the evidence picker offers; the server decides by the file's bytes.
export const EVIDENCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.eml,application/pdf,image/png,image/jpeg,message/rfc822";
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export function evidenceProblem(file: { name: string; size: number }): "empty" | "tooLarge" | "type" | null {
  if (file.size === 0) return "empty";
  if (file.size > EVIDENCE_MAX_BYTES) return "tooLarge";
  return /\.(pdf|png|jpe?g|eml)$/i.test(file.name) ? null : "type";
}
