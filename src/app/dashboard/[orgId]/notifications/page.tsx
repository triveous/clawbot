"use client";

import { use, useMemo, useState } from "react";
import { SectionCard, Icon, Segmented, type IconName } from "@/components/dashboard";

type Kind = "info" | "ok" | "warn" | "danger";
type Bucket = "today" | "yest" | "older";
type Tab = "all" | "unread" | "alerts";
type Category = "all" | "billing" | "assistants" | "platform" | "team" | "security";

type Notif = {
  id: string;
  kind: Kind;
  icon: IconName;
  time: string;
  bucket: Bucket;
  category: Exclude<Category, "all">;
  title: string;
  detail: string;
  actor?: string;
  unread: boolean;
};

// Seed — replaces the bell's static list with the same shape, so the UI is
// ready for a real /api/notifications endpoint in a future release.
const SEED: Omit<Notif, "unread">[] = [
  {
    id: "n1",
    kind: "danger",
    icon: "alert",
    time: "2m",
    bucket: "today",
    category: "billing",
    title: "Payment method needs attention",
    detail: "Update your card to avoid service interruption.",
    actor: "Billing",
  },
  {
    id: "n2",
    kind: "warn",
    icon: "cpu",
    time: "14m",
    bucket: "today",
    category: "assistants",
    title: "CPU usage elevated",
    detail: "One of your assistants averaged 87% CPU over the last hour.",
    actor: "Monitor",
  },
  {
    id: "n3",
    kind: "info",
    icon: "gitBranch",
    time: "3h",
    bucket: "today",
    category: "platform",
    title: "New OpenClaw release",
    detail: "Rolling out over the next 48 hours. Release notes →",
    actor: "Platform",
  },
  {
    id: "n4",
    kind: "ok",
    icon: "receipt",
    time: "6d",
    bucket: "older",
    category: "billing",
    title: "Latest invoice paid",
    detail: "Charged to your default payment method.",
    actor: "Billing",
  },
  {
    id: "n5",
    kind: "info",
    icon: "users",
    time: "2d",
    bucket: "yest",
    category: "team",
    title: "A teammate accepted your invite",
    detail: "They can now create assistants on this org.",
    actor: "Team",
  },
  {
    id: "n6",
    kind: "warn",
    icon: "key",
    time: "4d",
    bucket: "older",
    category: "security",
    title: "API token rotates in 7 days",
    detail: "Rotate the token on any assistant&rsquo;s Connect tab to avoid downtime.",
    actor: "Security",
  },
];

const TABS = [
  { value: "all" as const, label: "All" },
  { value: "unread" as const, label: "Unread" },
  { value: "alerts" as const, label: "Alerts" },
];

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "billing", label: "Billing" },
  { value: "assistants", label: "Assistants" },
  { value: "platform", label: "Platform" },
  { value: "team", label: "Team" },
  { value: "security", label: "Security" },
];

export default function NotificationsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId: _orgId } = use(params);
  const [notifs, setNotifs] = useState<Notif[]>(() =>
    SEED.map((n) => ({ ...n, unread: true })),
  );
  const [tab, setTab] = useState<Tab>("all");
  const [category, setCategory] = useState<Category>("all");

  const markRead = (id: string) =>
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));

  const markAll = () =>
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));

  const clearAll = () => setNotifs([]);

  const filtered = notifs.filter((n) => {
    if (tab === "unread" && !n.unread) return false;
    if (tab === "alerts" && n.kind !== "danger" && n.kind !== "warn") return false;
    if (category !== "all" && n.category !== category) return false;
    return true;
  });

  const groups = useMemo(() => {
    const buckets: Record<Bucket, Notif[]> = { today: [], yest: [], older: [] };
    for (const n of filtered) buckets[n.bucket].push(n);
    return (
      [
        { key: "today" as const, label: "Today", items: buckets.today },
        { key: "yest" as const, label: "Yesterday", items: buckets.yest },
        { key: "older" as const, label: "Earlier", items: buckets.older },
      ] as const
    ).filter((g) => g.items.length > 0);
  }, [filtered]);

  const unread = notifs.filter((n) => n.unread).length;
  const alerts = notifs.filter((n) => n.kind === "danger" || n.kind === "warn").length;

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Notifications{" "}
            <span className="faint" style={{ fontSize: 20, fontWeight: 400 }}>
              {notifs.length}
            </span>
          </h1>
          <div className="page__sub">
            {unread} unread · {alerts} alert{alerts !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="page__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={markAll}
            disabled={unread === 0}
          >
            <Icon name="check" size={14} />
            Mark all read
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={clearAll}
            disabled={notifs.length === 0}
          >
            <Icon name="trash" size={14} />
            Clear all
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Segmented value={tab} onChange={setTab} options={TABS} />
        <select
          className="select"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          style={{ width: "auto" }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <SectionCard pad={false}>
        {groups.length === 0 ? (
          <div
            style={{
              padding: "72px 24px",
              textAlign: "center",
              color: "var(--muted-foreground)",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                margin: "0 auto 14px",
                background: "var(--db-bg-2)",
                display: "grid",
                placeItems: "center",
                color: "var(--success)",
              }}
            >
              <Icon name="check" size={22} />
            </div>
            <div
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: 22,
                marginBottom: 6,
                color: "var(--foreground)",
              }}
            >
              You&rsquo;re all caught up
            </div>
            <div style={{ fontSize: 13 }}>
              {tab === "alerts"
                ? "No alerts need your attention right now."
                : tab === "unread"
                  ? "Nothing new since you last looked."
                  : "No notifications in this filter. We'll surface things here as they happen."}
            </div>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="notif__group">
              <div className="notif__group-head">
                {g.label}
                <span className="notif__group-count">{g.items.length}</span>
              </div>
              {g.items.map((n) => (
                <div
                  key={n.id}
                  className={`notif__item${n.unread ? " is-unread" : ""}`}
                  onClick={() => markRead(n.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") markRead(n.id);
                  }}
                >
                  <div className={`notif__icon is-${n.kind}`}>
                    <Icon name={n.icon} size={14} />
                  </div>
                  <div className="notif__body">
                    <div className="notif__text">{n.title}</div>
                    <div className="notif__sub">{n.detail}</div>
                    <div className="notif__meta">
                      <span className="notif__time">{n.time} ago</span>
                      {n.actor ? <span className="notif__sep">·</span> : null}
                      {n.actor ? <span className="notif__actor">{n.actor}</span> : null}
                      <span className="notif__sep">·</span>
                      <span className="notif__actor" style={{ textTransform: "capitalize" }}>
                        {n.category}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </SectionCard>

      <div
        className="faint"
        style={{
          fontSize: 12,
          marginTop: 14,
          padding: "0 4px",
          lineHeight: 1.6,
        }}
      >
        Seed data is shown while the <code>/api/notifications</code> endpoint is being built.
        Mark-read and clear actions are local to this browser until it lands.
      </div>
    </div>
  );
}
