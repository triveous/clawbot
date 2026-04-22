"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRpc } from "@/hooks/use-rpc";
import { SectionCard, Callout, Icon } from "@/components/dashboard";
import type { AssistantResponse } from "@/types/assistant";

export function SettingsTab({
  a,
  orgId,
  onUpdated,
}: {
  a: AssistantResponse;
  orgId: string;
  onUpdated: () => Promise<void>;
}) {
  const rpc = useRpc();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (rpc.api.assistants as any)[":id"].retry.$post({ param: { id: a.id } });
      await onUpdated();
    } finally {
      setRetrying(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (rpc.api.assistants as any)[":id"].$delete({ param: { id: a.id } });
      router.push(`/dashboard/${orgId}`);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      {a.status === "error" ? (
        <SectionCard
          title="Retry provisioning"
          sub="Re-runs the provisioning workflow using your existing credit"
        >
          <Callout kind="warn" icon="alert">
            {a.lastErrorAt
              ? `Last failure at ${new Date(a.lastErrorAt).toLocaleString()}.`
              : "This assistant failed to provision."}
          </Callout>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={retry}
              disabled={retrying}
            >
              <Icon name="refresh" size={14} />
              {retrying ? "Retrying…" : "Retry provisioning"}
            </button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Identity">
        <dl className="kv">
          <dt>Name</dt>
          <dd className="mono">{a.name}</dd>
          <dt>ID</dt>
          <dd className="mono">{a.id}</dd>
          <dt>Hostname</dt>
          <dd className="mono">{a.hostname ?? "pending"}</dd>
        </dl>
        <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>
          Renaming isn&rsquo;t supported yet — the name is used as the hostname slug.
        </div>
      </SectionCard>

      <SectionCard className="danger" title="Danger zone">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Delete this assistant</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              Destroys the Hetzner VPS and releases the credit back to your org. This can&rsquo;t
              be undone.
            </div>
          </div>
          {!showConfirm ? (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => setShowConfirm(true)}
            >
              <Icon name="trash" size={14} />
              Delete
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 300 }}>
              <div className="faint" style={{ fontSize: 12 }}>
                Type <span className="mono">{a.name}</span> to confirm.
              </div>
              <input
                className="input"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={a.name}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setShowConfirm(false);
                    setConfirmName("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  onClick={handleDelete}
                  disabled={deleting || confirmName !== a.name}
                >
                  <Icon name="trash" size={14} />
                  {deleting ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
