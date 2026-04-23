"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { Icon } from "./icon";

function initials(name: string | null, email: string | null | undefined) {
  const src = name?.trim() || email?.trim() || "";
  if (!src) return "?";
  const parts = src.split(/[\s@.+_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

export function UserChip({
  orgId,
  onOpenPalette,
}: {
  orgId: string;
  onOpenPalette?: () => void;
}) {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

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

  if (!isLoaded) {
    return (
      <div className="userchip cursor-default">
        <div className="userchip__avatar" />
        <div className="flex-1 min-w-0">
          <div className="userchip__name">Loading…</div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const name = user.fullName ?? user.username ?? null;
  const email = user.primaryEmailAddress?.emailAddress ?? null;
  const displayName = name ?? email ?? "You";
  const initialsText = initials(name, email);

  // Clerk always returns an imageUrl (falls back to a stock avatar when none
  // uploaded) — only render the <img> when the user has actually uploaded
  // something. Otherwise we show the design's gradient-with-initials tile.
  const avatarNode =
    user.hasImage && user.imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.imageUrl}
        alt=""
        className="userchip__avatar object-cover"
      />
    ) : (
      <div className="userchip__avatar">{initialsText}</div>
    );

  return (
    <div
      ref={rootRef}
      className="userchip relative cursor-pointer"
      onClick={() => setOpen((v) => !v)}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
    >
      {avatarNode}
      <div className="flex-1 min-w-0">
        <div className="userchip__name">{displayName}</div>
        {email && email !== displayName ? (
          <div className="userchip__mail">{email}</div>
        ) : null}
      </div>
      <span className="orgswitch__caret">
        <Icon name="chevDown" size={12} />
      </span>

      {open ? (
        <div
          className="orgmenu bottom-[calc(100%+6px)] top-auto left-2 right-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 pt-2.5 pb-2 flex items-center gap-2.5 border-b border-border">
            {avatarNode}
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-foreground truncate">
                {displayName}
              </div>
              {email ? (
                <div className="text-[11px] text-muted-foreground/70 truncate">
                  {email}
                </div>
              ) : null}
            </div>
          </div>

          <Link
            href={`/dashboard/${orgId}/settings`}
            className="orgmenu__item"
            onClick={() => setOpen(false)}
          >
            <div className="orgmenu__avatar bg-muted text-muted-foreground border border-border">
              <Icon name="settings" size={12} />
            </div>
            Account settings
          </Link>

          {onOpenPalette ? (
            <div
              className="orgmenu__item"
              onClick={() => {
                setOpen(false);
                onOpenPalette();
              }}
            >
              <div className="orgmenu__avatar bg-muted text-muted-foreground border border-border">
                <Icon name="search" size={12} />
              </div>
              <div className="flex-1">Command menu</div>
              <span className="kbd">⌘K</span>
            </div>
          ) : null}

          <div className="orgmenu__divider" />

          <div
            className="orgmenu__item text-primary"
            onClick={() =>
              void signOut(() => {
                setOpen(false);
                router.push("/login");
              })
            }
          >
            <div
              className="orgmenu__avatar"
              style={{
                background: "color-mix(in oklab, var(--db-red) 12%, transparent)",
                color: "var(--db-red)",
                border:
                  "1px solid color-mix(in oklab, var(--db-red) 24%, transparent)",
              }}
            >
              <Icon name="logOut" size={12} />
            </div>
            Log out
          </div>
        </div>
      ) : null}
    </div>
  );
}
