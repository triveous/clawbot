"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./icon";

type NotifKind = "info" | "ok" | "warn" | "danger";
type NotifBucket = "today" | "yest" | "older";

export type Notif = {
  id: string;
  kind: NotifKind;
  icon: IconName;
  time: string;
  bucket: NotifBucket;
  category: string;
  title: string;
  detail: string;
  actor?: string;
  unread: boolean;
  href?: string;
};

// Seed notifications — once we wire a real notifications API, this becomes
// the initial value from an RPC call. Keeping the data shape identical so
// the UI stays untouched.
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
];

type Tab = "all" | "unread" | "alerts";

export function NotifBell({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [notifs, setNotifs] = useState<Notif[]>(() =>
    SEED.map((n) => ({ ...n, unread: true }))
  );
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = notifs.filter((n) => n.unread).length;
  const alertCount = notifs.filter((n) => n.kind === "danger" || n.kind === "warn").length;

  const markAll = () => setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
  const markRead = (id: string) =>
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));

  const filtered = notifs.filter((n) => {
    if (tab === "unread") return n.unread;
    if (tab === "alerts") return n.kind === "danger" || n.kind === "warn";
    return true;
  });

  const groups = useMemo(() => {
    const buckets: Record<NotifBucket, Notif[]> = { today: [], yest: [], older: [] };
    filtered.forEach((n) => buckets[n.bucket].push(n));
    return (
      [
        { key: "today" as const, label: "Today", items: buckets.today },
        { key: "yest" as const, label: "Yesterday", items: buckets.yest },
        { key: "older" as const, label: "Earlier", items: buckets.older },
      ] as const
    ).filter((g) => g.items.length > 0);
  }, [filtered]);

  return (
    <div className="topbar__icon-wrap" ref={ref}>
      <button
        type="button"
        className={`topbar__icon${open ? " is-active" : ""}`}
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Icon name="bell" size={16} />
        {unread > 0 ? (
          unread === 1 ? (
            <span className="notif-badge notif-badge--dot" aria-label="1 unread" />
          ) : (
            <span className="notif-badge" aria-label={`${unread} unread`}>
              {unread > 9 ? "9+" : unread}
            </span>
          )
        ) : null}
      </button>

      {open ? (
        <div className="notif">
          <div className="notif__head">
            <div className="notif__title">
              Inbox
              {unread > 0 ? (
                <span className="notif__unread-count">{unread} new</span>
              ) : null}
            </div>
            <div className="notif__head-actions">
              <button
                type="button"
                className="notif__mark"
                onClick={(e) => {
                  e.stopPropagation();
                  markAll();
                }}
                title="Mark all read"
              >
                <Icon name="check" size={12} />
                Mark all read
              </button>
              <Link
                href={`/dashboard/${orgId}/settings`}
                className="notif__mark"
                title="Notification preferences"
                onClick={() => setOpen(false)}
              >
                <Icon name="settings" size={12} />
              </Link>
            </div>
          </div>

          <div className="notif__tabs">
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
                className={`notif__tab${tab === k ? " is-active" : ""}`}
                onClick={() => setTab(k)}
              >
                {label}
                {count > 0 ? <span className="notif__tab-count">{count}</span> : null}
              </button>
            ))}
          </div>

          <div className="notif__list">
            {groups.length === 0 ? (
              <div className="notif__empty">
                <div className="notif__empty-icon">
                  <Icon name="check" size={22} />
                </div>
                <div className="notif__empty-title">You&rsquo;re all caught up</div>
                <div className="notif__empty-sub">
                  {tab === "alerts"
                    ? "No alerts need your attention right now."
                    : tab === "unread"
                      ? "Nothing new since you last looked."
                      : "We'll let you know when something needs you."}
                </div>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="notif__group">
                  <div className="notif__group-head">
                    {g.label}
                    <span className="notif__group-count">{g.items.length}</span>
                  </div>
                  {g.items.slice(0, 4).map((n) => (
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
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="notif__foot">
            <Link
              href={`/dashboard/${orgId}/notifications`}
              onClick={() => setOpen(false)}
              className="btn btn--ghost btn--sm"
            >
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
