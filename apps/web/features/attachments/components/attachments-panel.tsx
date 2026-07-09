"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { formatBytes } from "@/lib/format";
import { useAttachments, useDeleteAttachment, useUploadAttachment } from "../hooks/use-attachments";
import type { AttachableType } from "@pentesthub/shared";

export function AttachmentsPanel({
  attachableType,
  attachableId,
}: {
  attachableType: AttachableType;
  attachableId: string;
}) {
  const { data: attachments, isLoading } = useAttachments(attachableType, attachableId);
  const upload = useUploadAttachment(attachableType, attachableId);
  const remove = useDeleteAttachment(attachableType, attachableId);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success("File attached");
    } catch {
      toast.error("Upload failed. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Attachments</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          Upload file
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void handleFileChange(e)} />
      </div>

      {isLoading ? null : !attachments || attachments.length === 0 ? (
        <EmptyState icon={Paperclip} title="No attachments" className="py-6" />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {attachments.map((att) => (
            <li key={att.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{att.fileName}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(att.sizeBytes)}</p>
              </div>
              <a href={att.url} target="_blank" rel="noreferrer" title="Download">
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Download ${att.fileName}`}>
                  <Download className="size-3.5" />
                </Button>
              </a>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Delete ${att.fileName}`}
                onClick={() =>
                  remove.mutate(att.id, {
                    onError: () => toast.error("Couldn't delete attachment."),
                  })
                }
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
