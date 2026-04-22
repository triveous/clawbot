"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRpc } from "@/hooks/use-rpc";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Icon, type IconName } from "./icon";
import { formatPrice } from "@/lib/dashboard/format";

type AssistantStatus = "creating" | "active" | "error" | "stopped";
type Assistant = {
  id: string;
  name: string;
  status: AssistantStatus;
  region: string;
};
type Invoice = {
  id: string;
  number: string | null;
  stripeInvoiceId: string;
  amountDue: number;
  currency: string;
  status: string;
};

export function CommandPalette({
  open,
  onOpenChange,
  orgId,
  onCreateAssistant,
  onNewOrg,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  orgId: string;
  onCreateAssistant: () => void;
  onNewOrg: () => void;
}) {
  const router = useRouter();
  const rpc = useRpc();

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const load = useCallback(async () => {
    try {
      const [aRes, iRes] = await Promise.all([
        rpc.api.assistants.$get(),
        rpc.api.billing.invoices.$get(),
      ]);
      if (aRes.ok) {
        const d = (await aRes.json()) as { assistants: Assistant[] };
        setAssistants(d.assistants);
      }
      if (iRes.ok) {
        const d = (await iRes.json()) as { invoices: Invoice[] };
        setInvoices(d.invoices);
      }
    } catch {
      /* optional */
    }
  }, [rpc]);

  // Populate when the palette opens so the data reflects the current state
  // every time the user invokes ⌘K, without paying the cost on every render.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [open, load]);

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  type NavEntry = { label: string; sub: string; icon: IconName; href: string };
  const nav: NavEntry[] = [
    { label: "Assistants", sub: "Your agent fleet", icon: "bot", href: `/dashboard/${orgId}` },
    { label: "Billing & credits", sub: "Subscriptions, invoices, payment method", icon: "creditCard", href: `/dashboard/${orgId}/billing` },
    { label: "Pricing", sub: "Buy a credit", icon: "tag", href: `/dashboard/${orgId}/pricing` },
    { label: "Members", sub: "Invite teammates", icon: "users", href: `/dashboard/${orgId}/members` },
    { label: "Settings", sub: "Account, organization, notifications", icon: "settings", href: `/dashboard/${orgId}/settings` },
    { label: "Quickstart", sub: "Getting-started checklist", icon: "zap", href: `/dashboard/${orgId}/quickstart` },
    { label: "Docs", sub: "Reference documentation", icon: "bookOpen", href: `/dashboard/${orgId}/docs` },
    { label: "Notifications", sub: "Inbox, alerts, preferences", icon: "bell", href: `/dashboard/${orgId}/notifications` },
    { label: "Admin console", sub: "Staff-only platform controls", icon: "shield", href: `/dashboard/${orgId}/admin` },
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command menu"
      description="Jump to a page, find an assistant, or trigger an action."
      showCloseButton={false}
    >
      <CommandInput placeholder="Type a command or search — assistants, billing, settings…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            value="create assistant new"
            onSelect={() => {
              onOpenChange(false);
              onCreateAssistant();
            }}
          >
            <Icon name="plus" size={15} />
            <div className="flex flex-col">
              <span>Create assistant…</span>
              <span className="text-xs text-muted-foreground">Spin up a new OpenClaw VPS</span>
            </div>
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="buy credit plan subscription"
            onSelect={() => go(`/dashboard/${orgId}/pricing`)}
          >
            <Icon name="creditCard" size={15} />
            <div className="flex flex-col">
              <span>Buy credit…</span>
              <span className="text-xs text-muted-foreground">Browse plans</span>
            </div>
          </CommandItem>
          <CommandItem
            value="create organization new workspace"
            onSelect={() => {
              onOpenChange(false);
              onNewOrg();
            }}
          >
            <Icon name="users" size={15} />
            <div className="flex flex-col">
              <span>Create organization…</span>
              <span className="text-xs text-muted-foreground">New workspace</span>
            </div>
          </CommandItem>
          <CommandItem
            value="invite teammate member"
            onSelect={() => go(`/dashboard/${orgId}/members`)}
          >
            <Icon name="send" size={15} />
            <div className="flex flex-col">
              <span>Invite a teammate…</span>
              <span className="text-xs text-muted-foreground">Open the Members page</span>
            </div>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Go to">
          {nav.map((n) => (
            <CommandItem
              key={n.href}
              value={`${n.label} ${n.sub}`}
              onSelect={() => go(n.href)}
            >
              <Icon name={n.icon} size={15} />
              <div className="flex flex-col">
                <span>{n.label}</span>
                <span className="text-xs text-muted-foreground">{n.sub}</span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        {assistants.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Assistants">
              {assistants.slice(0, 10).map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.name} assistant ${a.region} ${a.status}`}
                  onSelect={() => go(`/dashboard/${orgId}/assistant/${a.id}`)}
                >
                  <Icon name="bot" size={15} />
                  <div className="flex flex-col">
                    <span>{a.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.region} · {a.status}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {invoices.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent invoices">
              {invoices.slice(0, 5).map((inv) => (
                <CommandItem
                  key={inv.id}
                  value={`invoice ${inv.number ?? inv.stripeInvoiceId}`}
                  onSelect={() => go(`/dashboard/${orgId}/billing`)}
                >
                  <Icon name="receipt" size={15} />
                  <div className="flex flex-col">
                    <span>{inv.number ?? inv.stripeInvoiceId.slice(0, 16)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatPrice(inv.amountDue, inv.currency)} · {inv.status}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
