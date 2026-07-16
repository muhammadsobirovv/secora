"use client";

import * as React from "react";
import { CalendarDays, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import {
  useCalendarEvents,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
  useUpdateCalendarEvent,
} from "@/features/bugbounty/hooks/use-bugbounty";
import type { CalendarEventType } from "@pentesthub/shared";

const EVENT_TYPES: CalendarEventType[] = ["SUBMISSION_DEADLINE", "FOLLOW_UP", "RETEST", "DISCLOSURE"];

function CreateEventDialog() {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<CalendarEventType>("SUBMISSION_DEADLINE");
  const [title, setTitle] = React.useState("");
  const [dueAt, setDueAt] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const createEvent = useCreateCalendarEvent();

  async function handleSubmit(): Promise<void> {
    try {
      await createEvent.mutateAsync({
        type,
        title,
        dueAt: new Date(dueAt).toISOString(),
        notes: notes || undefined,
      });
      toast.success("Event created");
      setOpen(false);
      setTitle("");
      setDueAt("");
      setNotes("");
    } catch {
      toast.error("Couldn't create this event.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New calendar event</DialogTitle>
          <DialogDescription>Submission deadlines, follow-ups, retests, disclosures.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CalendarEventType)}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="event-title">Title</Label>
            <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="event-due">Due at</Label>
            <Input id="event-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="event-notes">Notes</Label>
            <Textarea id="event-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={!title || !dueAt || createEvent.isPending}>
            {createEvent.isPending && <Loader2 className="size-4 animate-spin" />}
            Create event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BugBountyCalendarPage() {
  const { data: events, isLoading } = useCalendarEvents();
  const deleteEvent = useDeleteCalendarEvent();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <CalendarDays className="size-6" /> Calendar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Submission deadlines, follow-ups, retests, disclosures.</p>
        </div>
        <CreateEventDialog />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !events?.length ? (
        <EmptyState icon={CalendarDays} title="No events yet" />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {events
              .slice()
              .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
              .map((event) => (
                <CalendarEventRow key={event.id} event={event} onDeleted={() => deleteEvent.mutate(event.id)} />
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CalendarEventRow({
  event,
  onDeleted,
}: {
  event: {
    id: string;
    type: CalendarEventType;
    title: string;
    dueAt: string;
    completedAt: string | null;
    notes: string | null;
  };
  onDeleted: () => void;
}) {
  const updateEvent = useUpdateCalendarEvent(event.id);
  const isOverdue = !event.completedAt && new Date(event.dueAt).getTime() < Date.now();

  return (
    <div className="flex items-center justify-between gap-3 p-3 text-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{event.title}</p>
          <Badge variant="outline">{event.type}</Badge>
          {event.completedAt && (
            <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
              Done
            </Badge>
          )}
          {isOverdue && (
            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
              Overdue
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{new Date(event.dueAt).toLocaleString()}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!event.completedAt && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void updateEvent.mutateAsync({ completedAt: new Date().toISOString() }).then(() => toast.success("Marked complete"))
            }
            disabled={updateEvent.isPending}
          >
            <Check className="size-4" />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDeleted}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
