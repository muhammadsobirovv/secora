"use client";

import * as React from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AiChatInput({
  onSend,
  onCancel,
  disabled,
  streaming,
}: {
  onSend: (content: string) => void;
  onCancel: () => void;
  disabled: boolean;
  streaming: boolean;
}) {
  const [value, setValue] = React.useState("");

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="flex items-end gap-2 border-t bg-background p-3">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Ask about findings, recon data, CVEs, HTTP requests..."
        rows={2}
        disabled={disabled}
        className="min-h-[44px] resize-none"
      />
      {streaming ? (
        <Button type="button" variant="destructive" size="icon" onClick={onCancel} aria-label="Stop generating">
          <Square className="size-4" />
        </Button>
      ) : (
        <Button type="button" size="icon" onClick={handleSend} disabled={disabled || !value.trim()} aria-label="Send">
          <Send className="size-4" />
        </Button>
      )}
    </div>
  );
}
