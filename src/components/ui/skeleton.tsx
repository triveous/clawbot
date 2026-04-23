"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-muted",
        "bg-[linear-gradient(90deg,transparent,color-mix(in_oklch,var(--color-muted-foreground)_8%,transparent)_50%,transparent)] bg-[length:200%_100%]",
        "animate-[skeleton-shimmer_1.8s_ease-in-out_infinite]",
        className,
      )}
      {...rest}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  variableWidth?: boolean;
  className?: string;
}

export function SkeletonText({
  lines = 3,
  variableWidth = true,
  className,
}: SkeletonTextProps) {
  const widths = ["w-full", "w-[92%]", "w-[85%]", "w-[78%]", "w-[95%]", "w-[70%]"];
  return (
    <div className={cn("space-y-2", className)} aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3.5",
            variableWidth ? widths[i % widths.length] : "w-full",
          )}
        />
      ))}
    </div>
  );
}

export interface SkeletonRowProps {
  rows?: number;
  avatar?: boolean;
  icon?: boolean;
  dense?: boolean;
  className?: string;
}

export function SkeletonRow({
  rows = 3,
  avatar = false,
  icon = false,
  dense = false,
  className,
}: SkeletonRowProps) {
  return (
    <div
      className={cn("space-y-2", className)}
      role="status"
      aria-busy="true"
      aria-label="Loading list"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-border px-3",
            dense ? "py-2" : "py-3",
          )}
        >
          {avatar && <Skeleton className="size-8 shrink-0 rounded-full" />}
          {icon && !avatar && <Skeleton className="size-5 shrink-0 rounded" />}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-[40%]" />
            <Skeleton className="h-3 w-[65%]" />
          </div>
          <Skeleton className="h-7 w-20 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-lg border border-border p-4", className)}
      role="status"
      aria-busy="true"
    >
      <Skeleton className="mb-3 h-4 w-[35%]" />
      <SkeletonText lines={3} />
    </div>
  );
}

export interface SkeletonKPIProps {
  count?: number;
  className?: string;
}

export function SkeletonKPI({ count = 4, className }: SkeletonKPIProps) {
  return (
    <div
      className={cn(
        "grid gap-3",
        count === 2 && "sm:grid-cols-2",
        count === 3 && "sm:grid-cols-3",
        count === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
      role="status"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border p-4">
          <Skeleton className="mb-3 h-3 w-20" />
          <Skeleton className="mb-2 h-7 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export interface SkeletonChartProps {
  height?: number;
  className?: string;
}

export function SkeletonChart({ height = 240, className }: SkeletonChartProps) {
  return (
    <div
      className={cn("rounded-lg border border-border p-4", className)}
      role="status"
      aria-busy="true"
    >
      <Skeleton className="mb-4 h-4 w-32" />
      <div className="flex items-end gap-1.5" style={{ height }}>
        {Array.from({ length: 24 }).map((_, i) => {
          const h = 20 + ((i * 37) % 80);
          return (
            <Skeleton
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

export interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
}: SkeletonTableProps) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border", className)}
      role="status"
      aria-busy="true"
      aria-label="Loading table"
    >
      <div className="flex gap-4 border-b border-border bg-muted/40 px-4 py-2.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-4 border-b border-border px-4 py-3 last:border-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn("h-3.5 flex-1", c === cols - 1 && "max-w-20")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
