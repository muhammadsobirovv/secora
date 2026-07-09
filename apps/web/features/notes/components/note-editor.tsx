"use client";

import * as React from "react";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { MarkdownPreview } from "./markdown-preview";
import type { NoteDto } from "@pentesthub/shared";

interface NoteEditorProps {
  note: NoteDto;
  onSave: (data: { title?: string; content?: string }) => Promise<void>;
}

const AUTO_SAVE_DELAY_MS = 1200;

export function NoteEditor({ note, onSave }: NoteEditorProps) {
  const [title, setTitle] = React.useState(note.title ?? "");
  const [content, setContent] = React.useState(note.content);
  const [showPreview, setShowPreview] = React.useState(true);
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved">("idle");

  const debouncedTitle = useDebouncedValue(title, AUTO_SAVE_DELAY_MS);
  const debouncedContent = useDebouncedValue(content, AUTO_SAVE_DELAY_MS);
  const isFirstRun = React.useRef(true);

  React.useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (debouncedTitle === (note.title ?? "") && debouncedContent === note.content) return;

    setStatus("saving");
    onSave({ title: debouncedTitle || undefined, content: debouncedContent })
      .then(() => setStatus("saved"))
      .catch(() => setStatus("idle"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTitle, debouncedContent]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled note"
          className="border-none px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
        />
        <SaveStatus status={status} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview((v) => !v)}
          className="shrink-0"
        >
          {showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showPreview ? "Hide preview" : "Show preview"}
        </Button>
      </div>
      <div className={showPreview ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : "grid grid-cols-1"}>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write in markdown… supports tables, checklists, code blocks, and links."
          className="min-h-[60vh] resize-none font-mono text-sm leading-relaxed"
        />
        {showPreview && (
          <div className="min-h-[60vh] overflow-y-auto rounded-md border border-border p-4">
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>
    </div>
  );
}

function SaveStatus({ status }: { status: "idle" | "saving" | "saved" }) {
  if (status === "saving") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3" /> Saved
      </span>
    );
  }
  return null;
}
