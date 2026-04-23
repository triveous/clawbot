"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const sizeMap = {
  xs: "size-3 border-[1.5px]",
  sm: "size-3.5 border-[1.5px]",
  md: "size-4 border-2",
  lg: "size-5 border-2",
  xl: "size-6 border-[2.5px]",
} as const;

export type SpinnerSize = keyof typeof sizeMap;

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  /** Visually-hidden label for screen readers. Default "Loading". */
  label?: string;
}

export function Spinner({
  size = "md",
  label = "Loading",
  className,
  ...rest
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent",
        sizeMap[size],
        className,
      )}
      {...rest}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Dots({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Live"
      className={cn("inline-flex items-center gap-1", className)}
    >
      <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:0ms]" />
      <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
      <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}
