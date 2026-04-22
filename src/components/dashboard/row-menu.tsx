"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "./icon";

export type RowMenuItem =
  | { divider: true }
  | {
      divider?: false;
      label: string;
      icon?: IconName;
      onClick?: () => void;
      destructive?: boolean;
      disabled?: boolean;
    };

/**
 * Overflow menu attached to a table row. Uses shadcn's DropdownMenu (which
 * portals to `document.body` via Radix) so the popover isn't clipped by
 * `.card { overflow: hidden }`. Theming comes from shadcn CSS vars — so the
 * popover looks right even when portalled outside `.dashboard-root`.
 */
export function RowMenu({
  items,
  align = "end",
}: {
  items: RowMenuItem[];
  /** Menu alignment relative to trigger. `end` = right-aligned. */
  align?: "start" | "end" | "center";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="btn btn--outline btn--xs rowmenu__trigger"
        title="More actions"
        aria-label="More actions"
        onClick={(e) => e.stopPropagation()}
      >
        <Icon name="more" size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={4}
        className="min-w-48"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) => {
          if ("divider" in it && it.divider) {
            return <DropdownMenuSeparator key={`d${i}`} />;
          }
          const item = it as Exclude<RowMenuItem, { divider: true }>;
          return (
            <DropdownMenuItem
              key={`i${i}`}
              variant={item.destructive ? "destructive" : "default"}
              disabled={item.disabled}
              onSelect={() => item.onClick?.()}
            >
              {item.icon ? <Icon name={item.icon} size={13} /> : null}
              <span>{item.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
