import Image from "next/image";
import { cn } from "@/lib/utils";

/// The Secora "S" hexagon mark (public/secora-mark.png, cropped from the
/// brand logo with a transparent background so it sits on light and dark
/// surfaces alike). Decorative: always rendered next to the product name.
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/secora-mark.png"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      priority
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
