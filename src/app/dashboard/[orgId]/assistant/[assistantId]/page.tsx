"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Icon, StatusPill, type IconName } from "@/components/dashboard";
import { SkeletonKPI, SkeletonRow } from "@/components/ui/skeleton";
import { useAssistant } from "./use-assistant";
import { OverviewTab } from "./tabs/overview-tab";
import { AccessTab } from "./tabs/access-tab";
import { ConnectTab } from "./tabs/connect-tab";
import { MetricsTab } from "./tabs/metrics-tab";
import { SettingsTab } from "./tabs/settings-tab";
import {
  TerminalTab,
  LogsTab,
  FilesTab,
  VersionsTab,
} from "./tabs/stub-tabs";

type TabKey =
  | "overview"
  | "access"
  | "connect"
  | "metrics"
  | "terminal"
  | "logs"
  | "files"
  | "versions"
  | "settings";

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "overview", label: "Overview", icon: "activity" },
  { key: "access", label: "Access", icon: "key" },
  { key: "connect", label: "Connect", icon: "link" },
  { key: "metrics", label: "Monitor", icon: "cpu" },
  { key: "terminal", label: "Terminal", icon: "terminal" },
  { key: "logs", label: "Logs", icon: "file" },
  { key: "files", label: "Files", icon: "folder" },
  { key: "versions", label: "Versions", icon: "gitBranch" },
  { key: "settings", label: "Settings", icon: "settings" },
];

export default function AssistantDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; assistantId: string }>;
}) {
  const { orgId, assistantId } = use(params);
  const { state, assistant: a, plan, reload } = useAssistant(assistantId);
  const [tab, setTab] = useState<TabKey>("overview");

  if (state === "loading") {
    return (
      <div>
        <div className="page__head">
          <div>
            <h1 className="page__title">Assistant</h1>
          </div>
        </div>
        <SkeletonKPI count={4} className="mb-5" />
        <SkeletonRow rows={4} icon />
      </div>
    );
  }

  if (state === "not-found" || !a) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28 }}>
          Assistant not found
        </div>
        <div className="faint" style={{ marginTop: 6 }}>
          It may have been deleted.
        </div>
        <div style={{ marginTop: 18 }}>
          <Link href={`/dashboard/${orgId}`} className="btn btn--primary btn--sm">
            <Icon name="arrowLeft" size={14} />
            Back to assistants
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page__head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "var(--db-surface-2)",
                border: "1px solid var(--db-hair)",
                display: "grid",
                placeItems: "center",
                color: "var(--db-red)",
              }}
            >
              <Icon name="bot" size={18} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                    margin: 0,
                  }}
                >
                  {a.name}
                </h1>
                <StatusPill status={a.status} />
              </div>
              <div className="page__sub" style={{ marginTop: 4 }}>
                <span className="mono">{a.hostname ?? "hostname pending…"}</span>
                {plan ? ` · ${plan.displayName}` : null}
              </div>
            </div>
          </div>
        </div>
        <div className="page__actions">
          {a.status === "active" && a.hostname ? (
            <a
              href={a.accessMode === "tailscale_serve" ? `https://${a.hostname}` : "#"}
              target={a.accessMode === "tailscale_serve" ? "_blank" : undefined}
              rel={a.accessMode === "tailscale_serve" ? "noreferrer" : undefined}
              className="btn btn--ghost btn--sm"
              onClick={(e) => {
                if (a.accessMode !== "tailscale_serve") {
                  e.preventDefault();
                  setTab("connect");
                }
              }}
            >
              <Icon name="link" size={14} />
              Open gateway
            </a>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => void reload()}
            title="Refresh"
          >
            <Icon name="refresh" size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tabs__tab${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab a={a} plan={plan} /> : null}
      {tab === "access" ? <AccessTab a={a} onUpdated={reload} /> : null}
      {tab === "connect" ? <ConnectTab a={a} /> : null}
      {tab === "metrics" ? <MetricsTab a={a} /> : null}
      {tab === "terminal" ? <TerminalTab a={a} /> : null}
      {tab === "logs" ? <LogsTab a={a} /> : null}
      {tab === "files" ? <FilesTab a={a} /> : null}
      {tab === "versions" ? <VersionsTab a={a} /> : null}
      {tab === "settings" ? <SettingsTab a={a} orgId={orgId} onUpdated={reload} /> : null}
    </div>
  );
}
