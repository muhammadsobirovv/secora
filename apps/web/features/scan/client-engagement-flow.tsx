"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, MailCheck, Paperclip, Plus, Trash2, X } from "lucide-react";
import type { RoeAssetDto, RoeAuthorizationDto } from "@pentesthub/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/features/i18n/i18n-context";
import { ApiError } from "@/lib/api/client";
import * as roeApi from "@/lib/api/roe";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  EVIDENCE_ACCEPT,
  defaultWindow,
  emailLooksValid,
  evidenceProblem,
  parseAssetRows,
  toRequestBody,
  windowProblem,
  type AssetRow,
  type AssetRowError,
} from "./roe-form";
import { roeErrorKey } from "./roe-errors";

export type ClientStepId = "scope" | "evidence" | "waiting" | "ready";
const STEPS: { id: ClientStepId; labelKey: "roe.step.scope" | "roe.step.evidence" | "roe.step.waiting" | "roe.step.ready" }[] = [
  { id: "scope", labelKey: "roe.step.scope" },
  { id: "evidence", labelKey: "roe.step.evidence" },
  { id: "waiting", labelKey: "roe.step.waiting" },
  { id: "ready", labelKey: "roe.step.ready" },
];

const POLL_MS = 15_000;

/// The "I'm testing for a client" path: describe the scope and the client
/// contact, optionally attach the signed authorization, send the request, wait
/// for the client's email approval, then scan the approved assets. The server
/// enforces everything shown here (who may approve, the window, the assets);
/// the form only helps the user get it right the first time.
export function ClientEngagementFlow({
  resumeId,
  onScan,
  busy,
}: {
  /// Continue a request that already exists (from the Authorizations page).
  resumeId?: string | null;
  /// Starts a scan of one approved asset; resolves when the job was created.
  onScan: (roe: RoeAuthorizationDto, asset: RoeAssetDto) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [roeId, setRoeId] = React.useState<string | null>(resumeId ?? null);
  const [step, setStep] = React.useState<"scope" | "evidence">("scope");

  const roe = useQuery({
    queryKey: ["roe", roeId],
    queryFn: () => roeApi.getRoe(roeId as string),
    enabled: roeId !== null,
    refetchInterval: (query) => (query.state.data?.status === "PENDING" ? POLL_MS : false),
  });

  const current: ClientStepId = roeId === null ? step : roe.data?.status === "ACTIVE" ? "ready" : "waiting";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/40 bg-card p-4 sm:p-5">
      <ol aria-label={t("roe.stepper.label")} className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {STEPS.map((item, index) => {
          const position = STEPS.findIndex((s) => s.id === current);
          const state = index < position ? "done" : index === position ? "current" : "todo";
          return (
            <li
              key={item.id}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-md border px-2 py-1",
                state === "current" && "border-primary bg-primary/10 font-medium text-foreground",
                state === "done" && "border-border text-foreground",
                state === "todo" && "border-border text-muted-foreground",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-current text-[10px]">
                {state === "done" ? <Check className="size-3" aria-hidden="true" /> : index + 1}
              </span>
              <span className="min-w-0 break-words">{t(item.labelKey)}</span>
            </li>
          );
        })}
      </ol>

      {roeId === null ? (
        <RequestForm
          step={step}
          onStep={setStep}
          onSent={(created) => {
            queryClient.setQueryData(["roe", created.id], created);
            setRoeId(created.id);
            toast.success(t("roe.sent", { email: created.clientEmail }));
          }}
        />
      ) : roe.data ? (
        roe.data.status === "ACTIVE" ? (
          <ReadyPanel roe={roe.data} onScan={onScan} busy={busy} />
        ) : (
          <WaitingPanel
            roe={roe.data}
            onChanged={(next) => queryClient.setQueryData(["roe", next.id], next)}
            onNewRequest={() => {
              setRoeId(null);
              setStep("scope");
            }}
          />
        )
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("common.loading")}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Steps 1 and 2: the request
// ---------------------------------------------------------------------------

function RequestForm({
  step,
  onStep,
  onSent,
}: {
  step: "scope" | "evidence";
  onStep: (step: "scope" | "evidence") => void;
  onSent: (created: RoeAuthorizationDto) => void;
}) {
  const { t } = useI18n();
  const initial = React.useMemo(() => defaultWindow(new Date()), []);
  const [clientName, setClientName] = React.useState("");
  const [clientEmail, setClientEmail] = React.useState("");
  const [rows, setRows] = React.useState<AssetRow[]>([{ text: "", wildcard: false }]);
  const [windowStart, setWindowStart] = React.useState(initial.start);
  const [windowEnd, setWindowEnd] = React.useState(initial.end);
  const [signatoryName, setSignatoryName] = React.useState("");
  const [signatoryRole, setSignatoryRole] = React.useState("");
  const [accepted, setAccepted] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [touched, setTouched] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const { errors: assetErrors } = parseAssetRows(rows);
  const windowIssue = windowProblem(windowStart, windowEnd, new Date());
  const fileIssue = file ? evidenceProblem(file) : null;
  const scopeProblems = {
    clientName: clientName.trim() === "",
    clientEmail: !emailLooksValid(clientEmail),
    assets: assetErrors.size > 0,
    window: windowIssue !== null,
    signatoryName: signatoryName.trim() === "",
    signatoryRole: signatoryRole.trim() === "",
  };
  const scopeOk = !Object.values(scopeProblems).some(Boolean);

  const consentParts = t("roe.field.responsibility", { aup: "\u0000" }).split("\u0000");

  function assetErrorText(error: AssetRowError): string {
    return t(error === "ip" ? "roe.error.assetIp" : error === "empty" ? "roe.error.assetEmpty" : "roe.error.assetInvalid");
  }

  async function submit() {
    setTouched(true);
    const body = toRequestBody(
      { clientName, clientEmail, rows, windowStart, windowEnd, signatoryName, signatoryRole, responsibilityAccepted: accepted },
      new Date(),
    );
    if (!body || fileIssue) return;
    setSubmitting(true);
    try {
      onSent(await roeApi.createRoeRequest(body, file));
    } catch (error) {
      toast.error(error instanceof ApiError && error.code === "ROE_INVALID_REQUEST" && error.message ? error.message : t(roeErrorKey(error)));
      setSubmitting(false);
    }
  }

  if (step === "scope") {
    return (
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (scopeOk) onStep("evidence");
        }}
      >
        <Field id="roe-client-name" label={t("roe.field.clientName")} error={touched && scopeProblems.clientName ? t("roe.error.required") : null}>
          <Input id="roe-client-name" value={clientName} maxLength={120} autoComplete="organization" onChange={(e) => setClientName(e.target.value)} className="h-11 text-base" />
        </Field>

        <Field
          id="roe-client-email"
          label={t("roe.field.clientEmail")}
          help={t("roe.field.clientEmailHelp")}
          error={touched && scopeProblems.clientEmail ? t("roe.error.email") : null}
        >
          <Input
            id="roe-client-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            className="h-11 text-base"
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t("roe.field.assets")}</legend>
          <p className="text-xs text-muted-foreground">{t("roe.field.assetsHelp")}</p>
          {rows.map((row, index) => {
            const error = touched || row.text.trim() !== "" ? assetErrors.get(index) : undefined;
            const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(row.text.trim());
            return (
              <div key={index} className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={t("roe.field.assetLabel", { n: index + 1 })}
                    aria-invalid={error ? true : undefined}
                    value={row.text}
                    placeholder={t("roe.field.assetPlaceholder")}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="url"
                    onChange={(e) => setRows((all) => all.map((r, i) => (i === index ? { ...r, text: e.target.value } : r)))}
                    className="h-11 min-w-0 flex-1 text-base"
                  />
                  {rows.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-11 shrink-0"
                      aria-label={t("roe.field.removeAsset", { n: index + 1 })}
                      onClick={() => setRows((all) => all.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
                {!isUrl && (
                  <div className="flex min-h-9 items-center gap-2">
                    <Checkbox
                      id={`roe-wild-${index}`}
                      checked={row.wildcard}
                      onCheckedChange={(checked) => setRows((all) => all.map((r, i) => (i === index ? { ...r, wildcard: checked === true } : r)))}
                    />
                    <Label htmlFor={`roe-wild-${index}`} className="text-xs font-normal text-muted-foreground">
                      {t("roe.field.wildcard")}
                    </Label>
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-xs text-destructive">
                    {assetErrorText(error)}
                  </p>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="h-11 self-start"
            disabled={rows.length >= 20}
            onClick={() => setRows((all) => [...all, { text: "", wildcard: false }])}
          >
            <Plus aria-hidden="true" /> {t("roe.field.addAsset")}
          </Button>
        </fieldset>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="roe-window-start" label={t("roe.field.windowStart")}>
            <Input id="roe-window-start" type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="h-11 text-base" />
          </Field>
          <Field id="roe-window-end" label={t("roe.field.windowEnd")}>
            <Input id="roe-window-end" type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="h-11 text-base" />
          </Field>
          <p className={cn("text-xs sm:col-span-2", touched && windowIssue ? "text-destructive" : "text-muted-foreground")} role={touched && windowIssue ? "alert" : undefined}>
            {touched && windowIssue ? t(`roe.error.window.${windowIssue}` as const) : t("roe.field.windowHelp")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="roe-signatory" label={t("roe.field.signatoryName")} error={touched && scopeProblems.signatoryName ? t("roe.error.required") : null}>
            <Input id="roe-signatory" value={signatoryName} maxLength={120} autoComplete="off" onChange={(e) => setSignatoryName(e.target.value)} className="h-11 text-base" />
          </Field>
          <Field id="roe-role" label={t("roe.field.signatoryRole")} error={touched && scopeProblems.signatoryRole ? t("roe.error.required") : null}>
            <Input id="roe-role" value={signatoryRole} maxLength={120} autoComplete="off" onChange={(e) => setSignatoryRole(e.target.value)} className="h-11 text-base" />
          </Field>
        </div>

        <Button type="submit" size="lg" className="h-11 w-full sm:w-auto sm:self-end">
          {t("roe.next")} <ArrowRight aria-hidden="true" />
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="roe-evidence" className="text-sm font-medium">
          {t("roe.field.evidence")}
        </Label>
        <p className="text-xs text-muted-foreground">{t("roe.field.evidenceHelp")}</p>
        <input
          id="roe-evidence"
          type="file"
          accept={EVIDENCE_ACCEPT}
          disabled={submitting}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-sm"
        />
        {file && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-all">{t("roe.field.evidenceChosen", { name: file.name })}</span>
            <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={t("roe.field.evidenceRemove")} onClick={() => setFile(null)}>
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
        {fileIssue && (
          <p role="alert" className="text-xs text-destructive">
            {t(`roe.error.evidence.${fileIssue}` as const)}
          </p>
        )}
      </div>

      <div className="flex items-start gap-3">
        <Checkbox id="roe-accept" checked={accepted} onCheckedChange={(c) => setAccepted(c === true)} className="mt-0.5" disabled={submitting} />
        <Label htmlFor="roe-accept" className="text-xs leading-relaxed font-normal text-muted-foreground">
          {consentParts.map((part, index) => (
            <React.Fragment key={index}>
              {index > 0 && (
                <Link href="/legal/acceptable-use" className="text-primary underline underline-offset-2">
                  {t("roe.field.aupLink")}
                </Link>
              )}
              {part}
            </React.Fragment>
          ))}
        </Label>
      </div>
      {touched && !accepted && (
        <p role="alert" className="text-xs text-destructive">
          {t("roe.error.responsibility")}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" size="lg" className="h-11" disabled={submitting} onClick={() => onStep("scope")}>
          <ArrowLeft aria-hidden="true" /> {t("roe.back")}
        </Button>
        <Button type="button" size="lg" className="h-11" disabled={submitting || !accepted || fileIssue !== null} onClick={() => void submit()}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("roe.submitting")}
            </>
          ) : (
            <>
              <MailCheck aria-hidden="true" /> {t("roe.submit")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        help && <p className="text-xs text-muted-foreground">{help}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: waiting for the client (or the request ended without approval)
// ---------------------------------------------------------------------------

function WaitingPanel({
  roe,
  onChanged,
  onNewRequest,
}: {
  roe: RoeAuthorizationDto;
  onChanged: (next: RoeAuthorizationDto) => void;
  onNewRequest: () => void;
}) {
  const { t } = useI18n();
  const [now, setNow] = React.useState(() => Date.now());
  const [working, setWorking] = React.useState<"resend" | "cancel" | null>(null);
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  async function act(kind: "resend" | "cancel") {
    setWorking(kind);
    try {
      const next = kind === "resend" ? await roeApi.resendRoe(roe.id) : await roeApi.cancelRoe(roe.id);
      onChanged(next);
      toast.success(t(kind === "resend" ? "roe.waiting.resent" : "roe.waiting.cancelled"));
    } catch (error) {
      toast.error(t(roeErrorKey(error)));
    } finally {
      setWorking(null);
    }
  }

  // PENDING, or EXPIRED because only the email link ran out (it can be sent again).
  const linkExpiredOnly = roe.status === "EXPIRED" && roe.canResendAt !== null;
  if (roe.status !== "PENDING" && !linkExpiredOnly) {
    const key = roe.status === "ACTIVE" ? "roe.outcome.REVOKED" : (`roe.outcome.${roe.status}` as const);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm" role="status">
          {t(key)}
        </p>
        <Button type="button" variant="outline" className="h-11 self-start" onClick={onNewRequest}>
          {t("roe.outcome.newRequest")}
        </Button>
      </div>
    );
  }

  const resendAt = roe.canResendAt ? new Date(roe.canResendAt).getTime() : 0;
  const canResend = working === null && resendAt <= now;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">{t("roe.waiting.title", { client: roe.clientName })}</h3>
        <p className="text-sm text-muted-foreground">{t("roe.waiting.body", { email: roe.clientEmail })}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-0.5">{t(`roe.status.${roe.status}` as const)}</span>
        </p>
      </div>
      <AssetList assets={roe.assets} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="h-11" disabled={!canResend} onClick={() => void act("resend")}>
          {working === "resend" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <MailCheck aria-hidden="true" />}
          {t("roe.waiting.resend")}
        </Button>
        <Button type="button" variant="ghost" className="h-11" disabled={working !== null} onClick={() => void act("cancel")}>
          {t("roe.waiting.cancel")}
        </Button>
      </div>
      {!canResend && resendAt > now && (
        <p className="text-xs text-muted-foreground">{t("roe.waiting.resendLater", { time: formatDateTime(new Date(resendAt).toISOString()) })}</p>
      )}
    </div>
  );
}

function AssetList({ assets }: { assets: RoeAssetDto[] }) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {assets.map((asset) => (
        <li key={asset.id} className="flex flex-wrap items-center gap-x-2 break-all">
          <span className="font-mono text-xs">{asset.value}</span>
          {asset.wildcard && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs">{t("roe.list.wildcardTag")}</span>}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Step 4: approved, scan the listed assets
// ---------------------------------------------------------------------------

function ReadyPanel({
  roe,
  onScan,
  busy,
}: {
  roe: RoeAuthorizationDto;
  onScan: (roe: RoeAuthorizationDto, asset: RoeAssetDto) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [starting, setStarting] = React.useState<string | null>(null);

  async function start(asset: RoeAssetDto) {
    setStarting(asset.id);
    try {
      await onScan(roe, asset);
    } catch {
      // The caller already told the user why.
      setStarting(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">{t("roe.ready.title", { client: roe.clientName })}</h3>
        <p className="text-sm text-muted-foreground">{t("roe.ready.body")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("roe.ready.window", { start: formatDateTime(roe.windowStart), end: formatDateTime(roe.windowEnd) })}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {roe.assets.map((asset) => (
          <li key={asset.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-xs break-all">{asset.value}</p>
              <p className="text-xs text-muted-foreground">
                {t(asset.wildcard ? "roe.ready.wildcardNote" : "roe.ready.hostOnlyNote", { asset: asset.host })}
              </p>
            </div>
            <Button
              type="button"
              className="h-auto min-h-11 w-full py-2 break-words whitespace-normal sm:w-auto"
              disabled={busy || starting !== null}
              onClick={() => void start(asset)}
            >
              {starting === asset.id ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" /> {t("roe.ready.starting")}
                </>
              ) : (
                t("roe.ready.scan", { asset: asset.host })
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
