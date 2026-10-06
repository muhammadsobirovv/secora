import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap w-fit",
  {
    variants: {
      // Tinted (15% fill + 40% border) rather than solid fills, so badges
      // sit quietly on the Signal surfaces. Primary uses foreground text:
      // #6D5EF5 as text on its own tint is below WCAG AA.
      variant: {
        default: "border-primary/40 bg-primary/15 text-foreground",
        secondary: "border-border bg-secondary text-secondary-foreground",
        destructive: "border-destructive/40 bg-destructive/15 text-destructive",
        success: "border-success/40 bg-success/15 text-success",
        warning: "border-warning/40 bg-warning/15 text-warning",
        outline: "text-foreground border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
