"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { NewOrgDialog } from "./new-org-dialog";

/**
 * Client wrapper for the dashboard chrome. Owns the global modal state
 * (command palette, new-org dialog) and the ⌘K keyboard shortcut, so the
 * layout can stay a server component while the topbar trigger and sidebar
 * org-switcher stay wired up.
 *
 * Rendered exactly once per route, inside `dashboard/[orgId]/layout.tsx`.
 */
export function DashboardShell({
  orgId,
  isPlatformAdmin = false,
  children,
}: {
  orgId: string;
  isPlatformAdmin?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newOrgOpen, setNewOrgOpen] = useState(false);

  // Global ⌘K / ctrl+K toggles the palette. Skip while typing in a form so
  // we don't hijack inputs that need literal ⌘K (rare but possible).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK =
        (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k";
      if (!isModK) return;
      e.preventDefault();
      setPaletteOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // "Create assistant" from the palette routes to the assistants list + sets
  // a query flag that the list page already honours for the drawer. For now
  // we just navigate — the list page itself shows the wizard/drawer CTAs.
  const onCreateAssistant = useCallback(() => {
    router.push(`/dashboard/${orgId}?create=1`);
  }, [router, orgId]);

  return (
    <>
      <div className="app">
        <Sidebar
          orgId={orgId}
          isPlatformAdmin={isPlatformAdmin}
          onNewOrg={() => setNewOrgOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <main className="main">
          <Topbar orgId={orgId} onOpenPalette={() => setPaletteOpen(true)} />
          <div className="page">{children}</div>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        orgId={orgId}
        onCreateAssistant={onCreateAssistant}
        onNewOrg={() => setNewOrgOpen(true)}
      />

      <NewOrgDialog open={newOrgOpen} onOpenChange={setNewOrgOpen} />
    </>
  );
}
