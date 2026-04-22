"use client";

import { useEffect, useRef, useState } from "react";
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

export function RowMenu({ items, align = "right" }: { items: RowMenuItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="rowmenu" ref={ref}>
      <button
        type="button"
        className="btn btn--outline btn--xs rowmenu__trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="More actions"
        aria-expanded={open}
      >
        <Icon name="more" size={14} />
      </button>
      {open ? (
        <div className={`rowmenu__pop rowmenu__pop--${align}`} onClick={(e) => e.stopPropagation()}>
          {items.map((it, i) => {
            if ("divider" in it && it.divider) {
              return <div key={`d${i}`} className="rowmenu__divider" />;
            }
            const item = it as Exclude<RowMenuItem, { divider: true }>;
            return (
              <div
                key={`i${i}`}
                className={`rowmenu__item${item.destructive ? " is-destructive" : ""}`}
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
      ) : null}
    </div>
  );
}
