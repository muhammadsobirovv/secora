"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FlaskConical, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ListSkeleton } from "@/components/common/skeletons";
import { useCreateResearchSession, useResearchSessions } from "@/features/research-sessions/hooks/use-research-sessions";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatDateTime } from "@/lib/format";
import type { ResearchSessionDto } from "@pentesthub/shared";

const STATUS_VARIANT: Record<ResearchSessionDto["status"], "default" | "secondary" | "success" | "outline"> = {
  ACTIVE: "default",
  PAUSED: "secondary",
  COMPLETED: "success",
  ARCHIVED: "outline",
};

/// Module 16 — task #371. A Research Session groups whatever a researcher
/// touches during one engagement (Recon jobs, Vuln scans, Findings, Notes,
/// Evidence, ad-hoc commands, AI conversations, Reports) via lightweight
/// links — see ResearchSessionService's doc comment. This page is the
/// entry point: start a session, then link entities to it from wherever
/// those entities already live (their own pages gain a "link to session"
/// action over time — this page itself only manages session lifecycle).
export default function ResearchSessionsPage() {
  const { data: sessions, isLoading } = useResearchSessions();
  const createSession = useCreateResearchSession();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createSession.mutateAsync({ name, description: description || undefined });
      toast.success("Research session started.");
      setName("");
      setDescription("");
      setOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn't start the session. Try again."));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Research Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Group Recon, Vuln, Findings, Notes, Evidence, and AI activity from one engagement.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              New session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start a research session</DialogTitle>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={(e) => void handleCreate(e)}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="session-name">Name</Label>
                <Input
                  id="session-name"
                  required
                  minLength={2}
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. acme.com — Q3 engagement"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="session-description">Description (optional)</Label>
                <Textarea
                  id="session-description"
                  rows={3}
                  maxLength={5_000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createSession.isPending}>
                  {createSession.isPending ? "Starting…" : "Start session"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ListSkeleton />
          ) : sessions && sessions.length > 0 ? (
            <div className="flex flex-col divide-y divide-border">
              {sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/research-sessions/${session.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50 -mx-2 px-2 rounded-md transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FlaskConical className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{session.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Started {formatDateTime(session.startedAt)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[session.status]}>{session.status}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No research sessions yet — start one to group your work on an engagement.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
