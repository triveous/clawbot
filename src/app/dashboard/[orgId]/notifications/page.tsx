"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/dashboard";

type Kind = "info" | "ok" | "warn" | "danger";
type Bucket = "today" | "yest" | "older";
type Filter = "all" | "unread" | "alerts";
type CategoryId = "all" | "assistants" | "billing" | "security" | "platform" | "team";

type Notif = {
  id: string;
  kind: Kind;
  icon: IconName;
  time: string;
  bucket: Bucket;
  category: Exclude<CategoryId, "all">;
  title: string;
  detail: string;
  actor?: string;
  actions?: { label: string; kind?: "primary" | "danger" }[];
  unread: boolean;
};

// Seed — same shape as the bell, swap for /api/notifications when it lands.
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
    actions: [{ label: "Pay now", kind: "primary" }, { label: "View invoice" }],
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
    actions: [{ label: "Open assistant", kind: "primary" }, { label: "Silence 1h" }],
  },
  {
    id: "n3",
    kind: "info",
    icon: "gitBranch",
    time: "3h",
    bucket: "today",
    category: "platform",
    title: "New OpenClaw release",
    detail: "Rolling out over the next 48 hours.",
    actor: "Platform",
    actions: [{ label: "Release notes" }, { label: "Upgrade now" }],
  },
  {
    id: "n4",
    kind: "info",
    icon: "users",
    time: "1d",
    bucket: "yest",
    category: "team",
    title: "A teammate accepted your invite",
    detail: "They can now create assistants on this org.",
    actor: "Team",
  },
  {
    id: "n5",
    kind: "warn",
    icon: "key",
    time: "4d",
    bucket: "older",
    category: "security",
    title: "API token rotates in 7 days",
    detail: "Rotate the token on any assistant's Connect tab to avoid downtime.",
    actor: "Security",
    actions: [{ label: "Rotate now", kind: "primary" }],
  },
  {
    id: "n6",
    kind: "ok",
    icon: "receipt",
    time: "6d",
    bucket: "older",
    category: "billing",
    title: "Latest invoice paid",
    detail: "Charged to your default payment method.",
    actor: "Billing",
    actions: [{ label: "Download PDF" }],
  },
];

const CATEGORIES: { id: CategoryId; label: string; icon: IconName }[] = [
  { id: "all", label: "All", icon: "bell" },
  { id: "assistants", label: "Assistants", icon: "bot" },
  { id: "billing", label: "Billing", icon: "creditCard" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "platform", label: "Platform", icon: "zap" },
  { id: "team", label: "Team", icon: "users" },
];

type Prefs = {
  email: boolean;
  slack: boolean;
  alerts: boolean;
  updates: boolean;
  digest: "off" | "daily" | "weekly";
};

const DEFAULT_PREFS: Prefs = {
  email: true,
  slack: false,
  alerts: true,
  updates: true,
  digest: "daily",
};

function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem("cb:notifprefs");
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function NotificationsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId: _orgId } = use(params);

  const [notifs, setNotifs] = useState<Notif[]>(() =>
    SEED.map((n) => ({ ...n, unread: true })),
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<CategoryId>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(readPrefs());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("cb:notifprefs", JSON.stringify(prefs));
    } catch {
      /* storage blocked */
    }
  }, [prefs]);

  const unread = notifs.filter((n) => n.unread).length;
  const alertCount = notifs.filter((n) => n.kind === "danger" || n.kind === "warn").length;

  const catCounts: Record<CategoryId, number> = {
    all: notifs.length,
    assistants: 0,
    billing: 0,
    security: 0,
    platform: 0,
    team: 0,
  };
  for (const n of notifs) catCounts[n.category]++;

  const shown = notifs.filter((n) => {
    if (filter === "unread" && !n.unread) return false;
    if (filter === "alerts" && n.kind !== "danger" && n.kind !== "warn") return false;
    if (category !== "all" && n.category !== category) return false;
    return true;
  });

  const groups = useMemo(() => {
    const buckets: Record<Bucket, Notif[]> = { today: [], yest: [], older: [] };
    for (const n of shown) buckets[n.bucket].push(n);
    return (
      [
        { key: "today" as const, label: "Today", items: buckets.today },
        { key: "yest" as const, label: "Yesterday", items: buckets.yest },
        { key: "older" as const, label: "Earlier", items: buckets.older },
      ] as const
    ).filter((g) => g.items.length > 0);
  }, [shown]);

  const markRead = (id: string) =>
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
  const markAll = () =>
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
  const dismiss = (id: string) =>
    setNotifs((prev) => prev.filter((n) => n.id !== id));

  const shownIds = shown.map((n) => n.id);
  const allSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(shownIds));
  const bulkMarkRead = () => {
    setNotifs((prev) =>
      prev.map((n) => (selected.has(n.id) ? { ...n, unread: false } : n)),
    );
    setSelected(new Set());
  };
  const bulkDismiss = () => {
    setNotifs((prev) => prev.filter((n) => !selected.has(n.id)));
    setSelected(new Set());
  };

  function updatePref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">Notifications</h1>
          <div className="page__sub">
            {notifs.length} total ·{" "}
            <span
              style={{
                color: unread ? "var(--db-red)" : "var(--db-text-dim)",
                fontWeight: unread ? 500 : 400,
              }}
            >
              {unread} unread
            </span>{" "}
            · {alertCount} need attention
          </div>
        </div>
        <div className="page__actions">
          <button
            type="button"
            className="btn btn--subtle"
            onClick={markAll}
            disabled={unread === 0}
          >
            <Icon name="check" size={14} />
            Mark all read
          </button>
        </div>
      </div>

      <div className="notif-page">
        {/* Left: category rail + delivery preferences */}
        <aside className="notif-page__aside">
          <div className="notif-rail">
            <div className="notif-rail__head">Inbox</div>
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`notif-rail__item${category === c.id ? " is-active" : ""}`}
                onClick={() => setCategory(c.id)}
              >
                <Icon name={c.icon} size={14} />
                <span>{c.label}</span>
                {catCounts[c.id] > 0 ? (
                  <span className="notif-rail__count">{catCounts[c.id]}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="notif-prefs">
            <div className="notif-prefs__head">
              <div className="notif-prefs__title">Delivery</div>
              <div className="notif-prefs__sub">How we reach you.</div>
            </div>
            {(
              [
                ["email", "Email", "Receipts, alerts, digests"],
                ["slack", "Slack", "Connect a workspace"],
                ["alerts", "Critical alerts", "Always on for billing + security"],
                ["updates", "Product updates", "New features, release notes"],
              ] as const
            ).map(([key, label, sub]) => (
              <div key={key} className="notif-prefs__row">
                <div className="notif-prefs__row-main">
                  <div className="notif-prefs__row-title">{label}</div>
                  <div className="notif-prefs__row-sub">{sub}</div>
                </div>
                <button
                  type="button"
                  className={`toggle${prefs[key] ? " is-on" : ""}`}
                  onClick={() => updatePref(key, !prefs[key])}
                  aria-pressed={prefs[key]}
                >
                  <span className="toggle__track" />
                </button>
              </div>
            ))}
            <div className="notif-prefs__divider" />
            <div className="notif-prefs__row">
              <div className="notif-prefs__row-main">
                <div className="notif-prefs__row-title">Digest</div>
                <div className="notif-prefs__row-sub">Grouped summary email</div>
              </div>
              <div className="seg seg--sm">
                {(["off", "daily", "weekly"] as const).map((v) => (
                  <button
                    type="button"
                    key={v}
                    className={`seg__item${prefs.digest === v ? " is-active" : ""}`}
                    onClick={() => updatePref("digest", v)}
                  >
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Right: toolbar + list */}
        <div className="notif-page__main">
          <div className="notif-toolbar">
            <label
              className={`notif-check${allSelected ? " is-on" : ""}${
                selected.size > 0 && !allSelected ? " is-partial" : ""
              }`}
            >
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span className="notif-check__box">
                {allSelected ? (
                  <Icon name="check" size={10} />
                ) : selected.size > 0 ? (
                  <span className="notif-check__dash" />
                ) : null}
              </span>
            </label>

            {selected.size > 0 ? (
              <>
                <div className="notif-toolbar__selcount">{selected.size} selected</div>
                <div className="notif-toolbar__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={bulkMarkRead}
                  >
                    <Icon name="check" size={12} />
                    Mark read
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={bulkDismiss}
                  >
                    <Icon name="x" size={12} />
                    Dismiss
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setSelected(new Set())}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="seg">
                  {(
                    [
                      ["all", "All", notifs.length],
                      ["unread", "Unread", unread],
                      ["alerts", "Alerts", alertCount],
                    ] as const
                  ).map(([k, label, count]) => (
                    <button
                      type="button"
                      key={k}
                      className={`seg__item${filter === k ? " is-active" : ""}`}
                      onClick={() => setFilter(k)}
                    >
                      {label}
                      <span
                        className="faint"
                        style={{ marginLeft: 6, fontSize: 11 }}
                      >
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="notif-toolbar__spacer" />
                <div className="notif-toolbar__hint">{shown.length} shown</div>
              </>
            )}
          </div>

          <div className="card">
            {groups.length === 0 ? (
              <div className="notif-page__empty">
                <div className="notif-page__empty-icon">
                  <Icon name="check" size={28} />
                </div>
                <div className="notif-page__empty-title">You&rsquo;re all caught up</div>
                <div className="notif-page__empty-sub">
                  Nothing matches this filter. Try{" "}
                  <a
                    onClick={() => {
                      setFilter("all");
                      setCategory("all");
                    }}
                    role="button"
                    tabIndex={0}
                    style={{ cursor: "pointer", color: "var(--primary)" }}
                  >
                    clear filters
                  </a>{" "}
                  or check back later.
                </div>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="notif-page__group">
                  <div className="notif-page__group-head">
                    <span className="notif-page__group-label">{g.label}</span>
                    <span className="notif-page__group-count">{g.items.length}</span>
                    <span className="notif-page__group-rule" />
                  </div>
                  {g.items.map((n) => (
                    <div
                      key={n.id}
                      className={`notif-row notif-row--full${
                        n.unread ? " is-unread" : ""
                      }${selected.has(n.id) ? " is-selected" : ""}`}
                      onClick={() => markRead(n.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") markRead(n.id);
                      }}
                    >
                      <label
                        className={`notif-check${selected.has(n.id) ? " is-on" : ""}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(n.id)}
                          onChange={() => toggleSel(n.id)}
                        />
                        <span className="notif-check__box">
                          {selected.has(n.id) ? <Icon name="check" size={10} /> : null}
                        </span>
                      </label>
                      <div
                        className={`notif__icon is-${n.kind}`}
                        style={{ flexShrink: 0 }}
                      >
                        <Icon name={n.icon} size={15} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="notif-row__title">{n.title}</div>
                        <div className="notif-row__sub">{n.detail}</div>
                        <div className="notif-row__meta">
                          {n.actor ? (
                            <span className="notif-row__actor">
                              <Icon name={n.category === "team" ? "users" : "bot"} size={11} />
                              {n.actor}
                            </span>
                          ) : null}
                          <span className={`notif-row__chip is-${n.kind}`}>{n.category}</span>
                          <span className="notif__time">{n.time} ago</span>
                        </div>
                        {n.actions && n.actions.length > 0 ? (
                          <div
                            className="notif-row__actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {n.actions.map((a, i) => (
                              <button
                                type="button"
                                key={i}
                                className={`notif__action${
                                  a.kind === "primary" ? " is-primary" : ""
                                }${a.kind === "danger" ? " is-danger" : ""}`}
                                onClick={() => {
                                  markRead(n.id);
                                }}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(n.id);
                        }}
                        title="Dismiss"
                        aria-label="Dismiss"
                        style={{ alignSelf: "flex-start" }}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
