import type { ReactNode } from "react";

export type PillKind =
  | "default"
  | "active"
  | "provisioning"
  | "stopped"
  | "error"
  | "info"
  | "warn"
  | "ok";

export function Pill({
  kind = "default",
  dot,
  pulse,
  children,
}: {
  kind?: PillKind;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
}) {
  const cls = `pill pill--${kind}` + (dot ? " pill--dot" : "");
  return (
    <span className={cls}>
      {pulse ? <span className="pulse" /> : null}
      {children}
    </span>
  );
}

type AssistantStatus =
  | "active"
  | "running"
  | "provisioning"
  | "creating"
  | "stopped"
  | "error"
  | "past_due"
  | "trialing"
  | "paid"
  | "canceled"
  | "expired";

const STATUS_MAP: Record<AssistantStatus, { kind: PillKind; label: string; dot?: boolean; pulse?: boolean }> = {
  active: { kind: "active", label: "Running", dot: true },
  running: { kind: "active", label: "Running", dot: true },
  provisioning: { kind: "provisioning", label: "Provisioning", pulse: true },
  creating: { kind: "provisioning", label: "Creating", pulse: true },
  stopped: { kind: "stopped", label: "Stopped", dot: true },
  error: { kind: "error", label: "Error", dot: true },
  past_due: { kind: "error", label: "Past due", dot: true },
  trialing: { kind: "info", label: "Trialing", dot: true },
  paid: { kind: "active", label: "Paid", dot: true },
  canceled: { kind: "stopped", label: "Canceled", dot: true },
  expired: { kind: "stopped", label: "Expired", dot: true },
};

export function StatusPill({ status }: { status: string }) {
  const c = STATUS_MAP[status as AssistantStatus] ?? { kind: "default" as PillKind, label: status };
  return (
    <Pill kind={c.kind} dot={c.dot} pulse={c.pulse}>
      {c.label}
    </Pill>
  );
}
