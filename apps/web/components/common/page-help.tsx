"use client";

import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface PageHelpAction {
  /// The button/control's visible label, e.g. "New scan" or "Import program".
  label: string;
  /// One sentence explaining what it does and when to use it.
  description: string;
}

export interface PageHelpProps {
  /// Short answer to "what is this page for?" — 1-3 sentences.
  summary: string;
  /// The key buttons/controls on this page, explained for a first-time
  /// visitor who doesn't yet know the product.
  actions?: PageHelpAction[];
  /// Optional short "how this fits into your workflow" list, e.g. recon
  /// steps in order. Rendered as a numbered list under `summary`.
  steps?: string[];
}

/// A small, consistent "what does this page do" popover — dropped into the
/// header row of a feature page next to its title. Exists because new
/// users land on pages like Recon or Vulnerabilities with no explanation
/// of what the section is for or what each button/action does; this gives
/// every page a one-click answer without needing a full product tour.
export function PageHelp({ summary, actions, steps }: PageHelpProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Help for this page">
          <CircleHelp className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-h-[70vh] overflow-y-auto text-sm">
        <p className="text-foreground">{summary}</p>

        {steps && steps.length > 0 && (
          <ol className="mt-3 list-decimal space-y-1 pl-4 text-muted-foreground">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}

        {actions && actions.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">On this page</p>
            <dl className="space-y-1.5">
              {actions.map((action) => (
                <div key={action.label}>
                  <dt className="font-medium text-foreground">{action.label}</dt>
                  <dd className="text-muted-foreground">{action.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
