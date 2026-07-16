"use client";

import * as React from "react";
import { FileBarChart, Loader2, Plus, Search, Sparkles, Trash2 } from "lucide-react";
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
  useCreatePayloadLibraryEntry,
  useDeletePayloadLibraryEntry,
  useExplainPayload,
  usePayloadLibrary,
} from "@/features/bugbounty/hooks/use-bugbounty";
import type { PayloadCategory } from "@pentesthub/shared";
import { PAYLOAD_CATEGORIES } from "@pentesthub/shared";

function CreatePayloadDialog() {
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<PayloadCategory>("XSS");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [example, setExample] = React.useState("");
  const createEntry = useCreatePayloadLibraryEntry();

  async function handleSubmit(): Promise<void> {
    try {
      await createEntry.mutateAsync({ category, title, description, example });
      toast.success("Payload added");
      setOpen(false);
      setTitle("");
      setDescription("");
      setExample("");
    } catch {
      toast.error("Couldn't add this payload.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New payload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New payload</DialogTitle>
          <DialogDescription>Add a custom payload to your workspace library.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as PayloadCategory)}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYLOAD_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="payload-title">Title</Label>
            <Input id="payload-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="payload-desc">Description</Label>
            <Textarea id="payload-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={2} />
          </div>
          <div>
            <Label htmlFor="payload-example">Example</Label>
            <Textarea
              id="payload-example"
              value={example}
              onChange={(e) => setExample(e.target.value)}
              className="mt-1 font-mono text-xs"
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void handleSubmit()} disabled={!title || !description || !example || createEntry.isPending}>
            {createEntry.isPending && <Loader2 className="size-4 animate-spin" />}
            Add payload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayloadCard({ id, category, title, description, example, aiExplanation, isCustom }: {
  id: string;
  category: PayloadCategory;
  title: string;
  description: string;
  example: string;
  aiExplanation: string | null;
  isCustom: boolean;
}) {
  const explainPayload = useExplainPayload(id);
  const deleteEntry = useDeletePayloadLibraryEntry();

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{title}</p>
            <Badge variant="outline" className="mt-1">
              {category}
            </Badge>
          </div>
          {isCustom && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void deleteEntry.mutateAsync(id).then(() => toast.success("Deleted"))}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{example}</pre>
        {aiExplanation && (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">{aiExplanation}</p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => void explainPayload.mutateAsync({}).then(() => toast.success("Explained"))}
          disabled={explainPayload.isPending}
        >
          {explainPayload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Explain with AI
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PayloadLibraryPage() {
  const [category, setCategory] = React.useState<PayloadCategory | "ALL">("ALL");
  const [search, setSearch] = React.useState("");
  const { data: entries, isLoading } = usePayloadLibrary({
    category: category === "ALL" ? undefined : category,
    search: search || undefined,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileBarChart className="size-6" /> Payload Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Seed payloads plus your workspace&apos;s custom entries.</p>
        </div>
        <CreatePayloadDialog />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Search payloads..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as PayloadCategory | "ALL")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {PAYLOAD_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : !entries?.length ? (
        <EmptyState icon={FileBarChart} title="No payloads found" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <PayloadCard key={entry.id} {...entry} />
          ))}
        </div>
      )}
    </div>
  );
}
