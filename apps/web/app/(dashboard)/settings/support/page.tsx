"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListSkeleton } from "@/components/common/skeletons";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useDiagnostics } from "@/features/system/hooks/use-diagnostics";
import { useCreateSupportTicket, useMySupportTickets } from "@/features/support/hooks/use-support";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatDateTime } from "@/lib/format";
import type { SupportTicketCategory, SupportTicketDto } from "@pentesthub/shared";

const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  BUG: "Bug report",
  BILLING: "Billing question",
  ACCOUNT: "Account issue",
  FEATURE_REQUEST: "Feature request",
  OTHER: "Other",
};

const STATUS_VARIANT: Record<SupportTicketDto["status"], "default" | "secondary" | "success" | "outline"> = {
  OPEN: "default",
  IN_PROGRESS: "secondary",
  RESOLVED: "success",
  CLOSED: "outline",
};

/// Module 15 — task #355. Builds directly on task #353's `useDiagnostics()`
/// — the optional "attach diagnostics" checkbox reuses the exact same
/// client-side self-test so a submitter doesn't have to separately visit
/// Settings → Diagnostics and copy/paste a report by hand.
export default function SupportSettingsPage() {
  const { user } = useAuth();
  const { report, run } = useDiagnostics();
  const createTicket = useCreateSupportTicket();
  const { data: tickets, isLoading } = useMySupportTickets();

  const [category, setCategory] = useState<SupportTicketCategory>("BUG");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [attachDiagnostics, setAttachDiagnostics] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let diagnosticsSnapshot: SupportTicketDto["diagnosticsSnapshot"] | undefined;
    if (attachDiagnostics) {
      if (!report) await run();
      const r = report;
      if (r) {
        diagnosticsSnapshot = {
          generatedAt: r.generatedAt,
          appVersion: r.appVersion,
          serverVersion: r.serverVersion,
          roundTripMs: r.roundTripMs,
          serverStatus: r.server.status,
          databaseStatus: r.server.databaseStatus,
          userAgent: r.client.userAgent,
        };
      }
    }

    try {
      await createTicket.mutateAsync({
        category,
        subject,
        message,
        email,
        // SupportTicketDto["diagnosticsSnapshot"] is typed nullable (it's
        // read back from a stored ticket, which can have no snapshot at
        // all), but CreateSupportTicketRequestDto's field is optional
        // without null — this local variable is only ever actually
        // assigned an object or left undefined above, never null, so this
        // narrows the type without changing behavior.
        diagnosticsSnapshot: diagnosticsSnapshot ?? undefined,
      });
      toast.success("Support request sent — we'll reply to your email.");
      setSubject("");
      setMessage("");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn't send your request. Try again in a moment."));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-4" />
            <CardTitle className="text-base">Contact support</CardTitle>
          </div>
          <CardDescription>
            Describe the problem and we&apos;ll reply to your email — no ticket portal login
            required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="support-category">Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as SupportTicketCategory)}>
                  <SelectTrigger id="support-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="support-email">Your email</Label>
                <Input
                  id="support-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="support-subject">Subject</Label>
              <Input
                id="support-subject"
                required
                minLength={3}
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="support-message">Message</Label>
              <Textarea
                id="support-message"
                required
                minLength={10}
                maxLength={10_000}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="support-diagnostics"
                checked={attachDiagnostics}
                onCheckedChange={(v) => setAttachDiagnostics(v === true)}
              />
              <Label htmlFor="support-diagnostics" className="text-sm font-normal text-muted-foreground">
                Attach diagnostics (app/server version, connectivity) to help us troubleshoot faster
              </Label>
            </div>
            <div>
              <Button type="submit" disabled={createTicket.isPending}>
                {createTicket.isPending ? "Sending…" : "Send request"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your requests</CardTitle>
          <CardDescription>Past support tickets tied to your account email.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ListSkeleton />
          ) : tickets && tickets.length > 0 ? (
            <div className="flex flex-col divide-y divide-border">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[ticket.category]} · {formatDateTime(ticket.createdAt)}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[ticket.status]}>{ticket.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No support requests yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
