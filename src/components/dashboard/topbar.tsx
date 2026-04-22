"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Icon } from "./icon";
import { ThemeToggle } from "./theme-toggle";
import { NotifBell } from "./notif-bell";

type Crumb = { label: string; href?: string };

function deriveBreadcrumb(pathname: string, orgId: string): Crumb[] {
  const rest = pathname.replace(`/dashboard/${orgId}`, "").replace(/^\/+/, "");
  const base: Crumb = { label: "Assistants", href: `/dashboard/${orgId}` };
  if (!rest) return [base];

  const segs = rest.split("/");
  const [first, ...tail] = segs;

  switch (first) {
    case "assistant":
      return [base, { label: tail[0] ? "Detail" : "Assistant" }];
    case "billing":
      return [{ label: "Billing" }];
    case "pricing":
      return [{ label: "Billing", href: `/dashboard/${orgId}/billing` }, { label: "Pricing" }];
    case "members":
      return [{ label: "Members" }];
    case "settings":
      return [{ label: "Settings" }];
    case "quickstart":
      return [{ label: "Quickstart" }];
    case "docs":
      return [{ label: "Docs" }];
    case "admin":
      return [{ label: "Admin console" }];
    case "notifications":
      return [{ label: "Notifications" }];
    default:
      return [{ label: first[0]?.toUpperCase() + first.slice(1) }];
  }
}

export function Topbar({
  orgId,
  onOpenPalette,
}: {
  orgId: string;
  onOpenPalette?: () => void;
}) {
  const pathname = usePathname() ?? `/dashboard/${orgId}`;
  const bc = deriveBreadcrumb(pathname, orgId);

  return (
    <header className="topbar">
      <div className="breadcrumb">
        {bc.map((c, i) => (
          <span key={i} style={{ display: "contents" }}>
            {c.href && i < bc.length - 1 ? (
              <Link href={c.href}>{c.label}</Link>
            ) : (
              <span className={i === bc.length - 1 ? "cur" : ""}>{c.label}</span>
            )}
            {i < bc.length - 1 ? (
              <span className="sep">
                <Icon name="chevRight" size={12} />
              </span>
            ) : null}
          </span>
        ))}
      </div>
      <div className="topbar__spacer" />
      <button
        type="button"
        className="topbar__search"
        onClick={() => onOpenPalette?.()}
        aria-label="Open command palette"
      >
        <Icon name="search" size={13} />
        <span>Search or jump to…</span>
        <span className="kbd">⌘K</span>
      </button>
      <Link href={`/dashboard/${orgId}/docs`} className="topbar__icon" title="Help">
        <Icon name="help" size={16} />
      </Link>
      <ThemeToggle />
      <NotifBell orgId={orgId} />
    </header>
  );
}
