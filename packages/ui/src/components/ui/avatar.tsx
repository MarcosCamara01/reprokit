import * as React from "react";
import { cn } from "../../lib/utils";

export function Avatar({
  className,
  src,
  alt,
  fallback,
}: {
  className?: string;
  src?: string | null;
  alt: string;
  fallback: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex size-6 items-center justify-center overflow-hidden rounded-full bg-secondary text-[10px] font-medium text-muted-foreground",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        <span>{fallback}</span>
      )}
    </span>
  );
}
