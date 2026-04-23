"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOrganization, useOrganizationList } from "@clerk/nextjs";
import { Icon } from "./icon";
import { Skeleton } from "@/components/ui/skeleton";

// Deterministic avatar gradient keyed off org id, so the same org always gets
// the same orange/blue/etc colour without us having to persist it.
const AVATAR_COLORS = [
  "var(--primary)",
  "oklch(0.58 0.14 230)",
  "oklch(0.62 0.14 148)",
  "oklch(0.68 0.17 310)",
  "oklch(0.75 0.15 75)",
  "oklch(0.58 0.14 180)",
] as const;
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initial(org: { name: string; slug?: string | null } | null) {
  const src = org?.name?.trim() || org?.slug?.trim() || "?";
  return src[0]?.toUpperCase() ?? "?";
}

function Avatar({
  org,
  size = 22,
}: {
  org: {
    id: string;
    name: string;
    slug?: string | null;
    imageUrl?: string;
    hasImage?: boolean;
  };
  size?: number;
}) {
  // Clerk's Organization.imageUrl is *always* populated — it falls back to a
  // Clerk-hosted default avatar when no logo has been uploaded. We only want
  // to render the <img> when the org actually has a custom logo (hasImage);
  // otherwise we keep the design's gradient-with-initial tile.
  if (org.hasImage && org.imageUrl) {
    return (
      <img
        src={org.imageUrl}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: size > 22 ? 8 : 6,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  const bg = colorFor(org.id);
  return (
    <div
      className="orgmenu__avatar"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${bg}, oklch(0.4 0.1 40))`,
        fontSize: size > 22 ? 11 : 10,
      }}
    >
      {initial(org)}
    </div>
  );
}

export function OrgSwitcher({
  orgId,
  onNewOrg,
}: {
  orgId: string;
  onNewOrg: () => void;
}) {
  const router = useRouter();
  const { organization } = useOrganization();
  const { userMemberships, setActive, isLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const memberships = (userMemberships?.data ?? []).map((m) => m.organization);
  const current =
    organization ?? memberships.find((o) => o.id === orgId) ?? null;

  async function switchTo(id: string) {
    if (!setActive) return;
    setOpen(false);
    try {
      await setActive({ organization: id });
      router.push(`/dashboard/${id}`);
    } catch {
      /* ignore — user stays on current org */
    }
  }

  return (
    <div
      ref={rootRef}
      className="orgswitch"
      onClick={() => setOpen((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
      aria-expanded={open}
    >
      {current ? (
        <Avatar
          org={{
            id: current.id,
            name: current.name,
            imageUrl: current.imageUrl,
            hasImage: current.hasImage,
          }}
        />
      ) : (
        <div className="orgmenu__avatar" />
      )}
      <div className="orgswitch__name">
        {current?.name ?? <Skeleton className="inline-block h-3 w-20 align-middle" />}
      </div>
      <span className="orgswitch__caret">
        <Icon name="chevDown" size={12} />
      </span>

      {open ? (
        <div className="orgmenu" onClick={(e) => e.stopPropagation()}>
          <div
            style={{
              padding: "8px 10px 6px",
              fontSize: 10,
              color: "var(--db-text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}
          >
            Switch organization
          </div>

          {!isLoaded ? (
            <div className="px-3 py-2 space-y-2" aria-busy="true" role="status">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 w-32" />
              <span className="sr-only">Loading organizations</span>
            </div>
          ) : memberships.length === 0 ? (
            <div
              style={{
                padding: "8px 12px",
                fontSize: 12,
                color: "var(--db-text-dim)",
              }}
            >
              You&rsquo;re not a member of any other organizations.
            </div>
          ) : (
            memberships.map((o) => {
              const isCurrent = o.id === (current?.id ?? orgId);
              return (
                <div
                  key={o.id}
                  className={`orgmenu__item${isCurrent ? " is-current" : ""}`}
                  onClick={() => {
                    if (isCurrent) setOpen(false);
                    else void switchTo(o.id);
                  }}
                >
                  <Avatar
                    org={{
                      id: o.id,
                      name: o.name,
                      slug: o.slug,
                      imageUrl: o.imageUrl,
                      hasImage: o.hasImage,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{o.name}</div>
                    {o.slug ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--db-text-faint)",
                          fontFamily: "var(--font-geist-mono)",
                        }}
                      >
                        {o.slug}
                      </div>
                    ) : null}
                  </div>
                  {isCurrent ? (
                    <span style={{ color: "var(--db-red)" }}>
                      <Icon name="check" size={14} />
                    </span>
                  ) : null}
                </div>
              );
            })
          )}

          <div className="orgmenu__divider" />

          <div
            className="orgmenu__item orgmenu__new"
            onClick={() => {
              setOpen(false);
              onNewOrg();
            }}
          >
            <div className="orgmenu__avatar">
              <Icon name="plus" size={14} />
            </div>
            Create organization
          </div>

          <Link
            href={`/dashboard/${orgId}/settings`}
            className="orgmenu__item"
            onClick={() => setOpen(false)}
          >
            <div
              className="orgmenu__avatar"
              style={{
                background: "var(--db-surface-2)",
                color: "var(--db-text-dim)",
                border: "1px solid var(--db-hair)",
              }}
            >
              <Icon name="settings" size={12} />
            </div>
            Organization settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
