"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icon";

export type RowMenuItem =
  | { divider: true }
  | {
      divider?: false;
      label: string;
      icon?: IconName;
      onClick?: () => void;
      destructive?: boolean;
    };

type Pos = { top: number; left: number; origin: "top-right" | "bottom-right" | "top-left" | "bottom-left" };

// Fall-back to useEffect on the server so SSR doesn't warn.
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function RowMenu({
  items,
  align = "right",
}: {
  items: RowMenuItem[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Position the popover once we know the trigger rect and the popover's own
  // dimensions. Flip up when there's not enough room below the trigger.
  useIsoLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const compute = () => {
      const trigger = triggerRef.current;
      const pop = popRef.current;
      if (!trigger || !pop) return;
      const tr = trigger.getBoundingClientRect();
      const pr = pop.getBoundingClientRect();
      const margin = 4;
      const viewH = window.innerHeight;
      const viewW = window.innerWidth;

      const below = tr.bottom + margin + pr.height <= viewH;
      const right = align === "right";
      const top = below ? tr.bottom + margin : tr.top - pr.height - margin;
      const left = right ? tr.right - pr.width : tr.left;
      const safeLeft = Math.max(8, Math.min(left, viewW - pr.width - 8));
      const vertical = below ? "top" : "bottom";
      const origin = `${vertical}-${right ? "right" : "left"}` as Pos["origin"];
      setPos({ top, left: safeLeft, origin });
    };
    compute();

    const close = (e: MouseEvent) => {
      const trigger = triggerRef.current;
      const pop = popRef.current;
      const target = e.target as Node | null;
      if (pop?.contains(target ?? null)) return;
      if (trigger?.contains(target ?? null)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => compute();
    const onResize = () => compute();

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    // Use capture for scroll so parent scrollers also reposition us.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, align]);

  const popover = open ? (
    <div
      ref={popRef}
      // NOTE: we intentionally drop the `rowmenu__pop--right / --left`
      // modifier classes here. Those set `right: 0` or `left: 0` in the
      // stylesheet; combined with our inline `left` from getBoundingClientRect
      // the browser would satisfy both sides and stretch the popover to the
      // full viewport width. We handle horizontal placement entirely inline.
      className="rowmenu__pop"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        // Explicitly clear the side anchors from the base class (`top: calc(100%+4)`)
        // and from the `--right`/`--left` modifiers we no longer apply.
        right: "auto",
        bottom: "auto",
        // Let content size it naturally up to a sensible cap so a single-item
        // menu doesn't stretch awkwardly.
        width: "max-content",
        maxWidth: "min(320px, calc(100vw - 16px))",
        // Hidden until we've computed the real position so the pop doesn't
        // flash in the top-left corner on the first render.
        visibility: pos ? "visible" : "hidden",
        transformOrigin: pos?.origin ?? "top right",
        zIndex: 1000,
      }}
      role="menu"
    >
      {items.map((it, i) => {
        if ("divider" in it && it.divider) {
          return <div key={`d${i}`} className="rowmenu__divider" />;
        }
        const item = it as Exclude<RowMenuItem, { divider: true }>;
        return (
          <div
            key={`i${i}`}
            className={`rowmenu__item${item.destructive ? " is-destructive" : ""}`}
            role="menuitem"
            onClick={() => {
              item.onClick?.();
              setOpen(false);
            }}
          >
            {item.icon ? <Icon name={item.icon} size={13} /> : null}
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="rowmenu">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn--outline btn--xs rowmenu__trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon name="more" size={14} />
      </button>
      {popover && typeof document !== "undefined"
        ? createPortal(popover, document.body)
        : null}
    </div>
  );
}
