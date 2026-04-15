"use client";

import { useState, useEffect, useCallback } from "react";
import { useRpc } from "@/hooks/use-rpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AssistantStatus = "creating" | "provisioning" | "running" | "stopped" | "error";

type Assistant = {
  id: string;
  name: string;
  status: AssistantStatus;
  provider: string;
  ipv4: string | null;
  region: string;
  createdAt: string;
};

const STATUS_VARIANT: Record<
  AssistantStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  running: "default",
  creating: "secondary",
  provisioning: "secondary",
  stopped: "outline",
  error: "destructive",
};

export default function DashboardPage() {
  const rpc = useRpc();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("fsn1");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await rpc.api.assistants.$get();
      const data = await res.json();
      setAssistants(data.assistants as Assistant[]);
    } catch {
      setError("Failed to load assistants");
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await rpc.api.assistants.$post({ json: { name: name.trim(), region } });
      if (!res.ok) {
        const err = await res.json();
        setError((err as { message?: string }).message ?? "Failed to create assistant");
        return;
      }
      setName("");
      await load();
    } catch {
      setError("Failed to create assistant");
    } finally {
      setCreating(false);
    }
  }

  async function del(id: string) {
    setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (rpc.api.assistants as any)[":id"].$delete({ param: { id } });
      await load();
    } catch {
      setError("Failed to delete assistant");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Assistants</h1>

      <Card>
        <CardHeader>
          <CardTitle>New Assistant</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Assistant name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              className="w-48"
            />
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="fsn1">fsn1 — Falkenstein</option>
              <option value="nbg1">nbg1 — Nuremberg</option>
              <option value="hel1">hel1 — Helsinki</option>
            </select>
            <Button onClick={create} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : assistants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assistants yet.</p>
      ) : (
        <div className="space-y-2">
          {assistants.map((assistant) => (
            <Card key={assistant.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={STATUS_VARIANT[assistant.status]}>
                    {assistant.status}
                  </Badge>
                  <span className="font-medium">{assistant.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {assistant.region}
                  </span>
                  {assistant.ipv4 && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {assistant.ipv4}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(assistant.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => del(assistant.id)}
                >
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
