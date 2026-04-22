"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrganizationList } from "@clerk/nextjs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Icon } from "@/components/dashboard";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

export function NewOrgDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { createOrganization, setActive } = useOrganizationList();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const slug = slugify(name);

  useEffect(() => {
    if (!open) {
      setName("");
      setError("");
      setCreating(false);
      return;
    }
    // Slight delay so the dialog is mounted before we try to focus.
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  async function submit() {
    if (!name.trim() || creating) return;
    if (!createOrganization || !setActive) {
      setError("Organization creation is not available right now.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const org = await createOrganization({ name: name.trim(), slug: slug || undefined });
      await setActive({ organization: org.id });
      onOpenChange(false);
      router.push(`/dashboard/${org.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create organization");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-[var(--font-instrument-serif)] text-[22px] font-normal">
            Create organization
          </DialogTitle>
          <DialogDescription>
            Your own workspace for agents, credits, and team.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <Field label="Name" hint="Shown in the sidebar. You can change this later.">
            <input
              ref={inputRef}
              className="input"
              placeholder="Acme Inc."
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </Field>

          <Field label="Slug" hint="Used in URLs and assistant hostnames.">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="faint mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                clawbot.dev/
              </span>
              <input
                className="input"
                value={slug || "—"}
                readOnly
                style={{ flex: 1, opacity: 0.7 }}
              />
            </div>
          </Field>

          <div
            style={{
              padding: 12,
              background: "var(--db-red-dim)",
              border: "1px solid color-mix(in oklab, var(--primary) 30%, transparent)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--db-text-dim)",
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                color: "var(--db-text)",
                fontWeight: 500,
                marginBottom: 3,
              }}
            >
              You&rsquo;ll start fresh
            </div>
            New orgs begin with zero credits. Buy one after creating to deploy your first
            assistant.
          </div>

          {error ? <div className="field__err">{error}</div> : null}
        </div>

        <DialogFooter>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void submit()}
            disabled={!name.trim() || creating}
          >
            <Icon name="plus" size={14} />
            {creating ? "Creating…" : "Create organization"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
