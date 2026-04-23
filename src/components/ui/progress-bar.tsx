"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  active?: boolean;
  position?: "top" | "inline";
  className?: string;
}

export function ProgressBar({
  active = true,
  position = "top",
  className,
}: ProgressBarProps) {
  if (!active) return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className={cn(
        "h-0.5 overflow-hidden bg-primary/10",
        position === "top" &&
          "pointer-events-none absolute left-0 right-0 top-0 z-10",
        className,
      )}
    >
      <div className="relative h-full">
        <div
          className={cn(
            "absolute top-0 h-full bg-primary",
            "animate-[progress-indeterminate_1.2s_cubic-bezier(0.4,0,0.2,1)_infinite]",
          )}
        />
      </div>
    </div>
  );
}
