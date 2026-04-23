"use client";

// UI shells for tabs whose backend isn't wired yet. Per handoff instructions
// we keep the UI in place so the design reads as intended; the shell makes it
// clear the feature is coming and what it will do.

import { SectionCard, Callout, Icon, type IconName } from "@/components/dashboard";
import type { AssistantResponse } from "@/types/assistant";

function ComingSoon({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  return (
    <SectionCard>
      <div
        style={{
          display: "grid",
          placeItems: "center",
          padding: "56px 24px",
          textAlign: "center",
          gap: 18,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "var(--db-red-dim)",
            color: "var(--db-red)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icon name={icon} size={28} />
        </div>
        <div>
          <div
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: 28,
              lineHeight: 1.15,
              marginBottom: 6,
            }}
          >
            {title}
          </div>
          <div style={{ color: "var(--muted-foreground)", fontSize: 14, maxWidth: 440 }}>
            {description}
          </div>
        </div>
        <Callout kind="info" icon="info">
          UI is in place — backend work is scheduled after the dashboard redesign.
        </Callout>
      </div>
    </SectionCard>
  );
}

// The page still passes `a` so these shells can start reading live data in
// a future stage without a signature change.
export function TerminalTab(_props: { a: AssistantResponse }) {
  return (
    <ComingSoon
      icon="terminal"
      title="Browser terminal"
      description="A web tty over SSH-exec so you can run ad-hoc commands on your VPS without leaving the dashboard. Pending the control-plane egress decision."
    />
  );
}

export function LogsTab({ a: _a }: { a: AssistantResponse }) {
  return (
    <ComingSoon
      icon="file"
      title="Live logs"
      description="Streamed systemd/openclaw journal with filtering, jump-to-error, and a saved-view picker. Wires once SSH-exec lands."
    />
  );
}

export function FilesTab({ a: _a }: { a: AssistantResponse }) {
  return (
    <ComingSoon
      icon="folder"
      title="Files"
      description="Browse and edit config files under /etc/openclaw and /root without SSHing. Diff before save, snapshot before deploy."
    />
  );
}

export function VersionsTab({ a: _a }: { a: AssistantResponse }) {
  return (
    <ComingSoon
      icon="gitBranch"
      title="Versions"
      description="Pin OpenClaw versions per assistant, roll back to a known-good snapshot, and promote between dev/staging."
    />
  );
}
