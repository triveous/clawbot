"use client";

import { useState, useEffect, useCallback } from "react";
import { getSnapshots, triggerSnapshotBuild, triggerSnapshotDelete } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Snapshot = {
  id: string;
  provider: string;
  providerSnapshotId: string;
  version: string;
  openclawVersion: string;
  isActive: boolean;
  createdAt: Date;
};

export default function AdminPage() {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState("");
  const [openclawVersion, setOpenclawVersion] = useState("");
  const [building, setBuilding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [runId, setRunId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await getSnapshots();
    setSnaps(data as Snapshot[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function del(snapshotId: string) {
    setDeleting(snapshotId);
    setError("");
    try {
      await triggerSnapshotDelete(snapshotId);
      await load();
    } catch {
      setError("Failed to start snapshot deletion");
    } finally {
      setDeleting(null);
    }
  }

  async function build() {
    if (!version.trim() || !openclawVersion.trim()) return;
    setBuilding(true);
    setError("");
    setRunId("");
    try {
      const result = await triggerSnapshotBuild(
        version.trim(),
        openclawVersion.trim(),
      );
      setRunId(result.runId);
      setVersion("");
      setOpenclawVersion("");
      await load();
    } catch {
      setError("Failed to start snapshot build");
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin — Snapshots</h1>

      <Card>
        <CardHeader>
          <CardTitle>Build New Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Version (e.g. v1.0)"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-40"
            />
            <Input
              placeholder="OpenClaw version (e.g. 1.2.3)"
              value={openclawVersion}
              onChange={(e) => setOpenclawVersion(e.target.value)}
              className="w-56"
            />
            <Button
              onClick={build}
              disabled={building || !version.trim() || !openclawVersion.trim()}
            >
              {building ? "Starting…" : "Build Snapshot"}
            </Button>
          </div>
          {runId && (
            <p className="text-sm text-muted-foreground">
              Workflow started —{" "}
              <span className="font-mono text-xs">{runId}</span>
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Registered Snapshots
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : snaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No snapshots registered.</p>
        ) : (
          snaps.map((snap) => (
            <Card key={snap.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex flex-wrap items-center gap-3">
                  {snap.isActive && <Badge>active</Badge>}
                  <span className="font-medium">{snap.version}</span>
                  <span className="text-xs text-muted-foreground">
                    OpenClaw {snap.openclawVersion}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {snap.provider}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {snap.providerSnapshotId}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(snap.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => del(snap.id)}
                  disabled={deleting === snap.id}
                >
                  {deleting === snap.id ? "Deleting…" : "Delete"}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
