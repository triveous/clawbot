"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listMembers,
  listInvitations,
  inviteMember,
  revokeInvitation,
  removeMember,
  updateMemberRole,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Member = {
  membershipId: string;
  userId: string;
  role: string;
  name: string | null;
  identifier: string;
  imageUrl: string;
};

type Invitation = {
  id: string;
  emailAddress: string;
  role: string;
  createdAt: number;
};

const ROLE_LABELS: Record<string, string> = {
  "org:admin": "Admin",
  "org:member": "Member",
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Invite form
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("org:member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    try {
      const [m, inv] = await Promise.all([listMembers(), listInvitations()]);
      setMembers(m);
      setInvitations(inv);
    } catch (e) {
      if (String(e).includes("Forbidden")) setForbidden(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function invite() {
    if (!email.trim()) return;
    setInviting(true);
    setInviteError("");
    setInviteSuccess("");
    try {
      await inviteMember(email.trim(), role);
      setEmail("");
      setInviteSuccess(`Invitation sent to ${email.trim()}`);
      await load();
    } catch (e) {
      setInviteError(String(e).replace("Error: ", ""));
    } finally {
      setInviting(false);
    }
  }

  async function revoke(invitationId: string) {
    setActionError("");
    try { await revokeInvitation(invitationId); await load(); }
    catch (e) { setActionError(String(e).replace("Error: ", "")); }
  }

  async function remove(memberUserId: string) {
    setActionError("");
    try { await removeMember(memberUserId); await load(); }
    catch (e) { setActionError(String(e).replace("Error: ", "")); }
  }

  async function changeRole(memberUserId: string, newRole: string) {
    setActionError("");
    try { await updateMemberRole(memberUserId, newRole); await load(); }
    catch (e) { setActionError(String(e).replace("Error: ", "")); }
  }

  if (forbidden) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Members</h1>
        <p className="text-sm text-muted-foreground">
          Only org admins can manage members.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Members</h1>

      {/* Invite */}
      <Card>
        <CardHeader><CardTitle>Invite Member</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setInviteError(""); setInviteSuccess(""); }}
                onKeyDown={(e) => e.key === "Enter" && invite()}
                className="w-64"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              >
                <option value="org:member">Member</option>
                <option value="org:admin">Admin</option>
              </select>
            </div>
            <Button onClick={invite} disabled={inviting || !email.trim()}>
              {inviting ? "Sending…" : "Send invite"}
            </Button>
          </div>
          {inviteSuccess && <p className="text-sm text-green-600">{inviteSuccess}</p>}
          {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
        </CardContent>
      </Card>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {/* Members list */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Members ({members.length})
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <Card key={m.membershipId}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {m.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.imageUrl} alt="" className="h-8 w-8 rounded-full" />
                    )}
                    <div>
                      {m.name && <p className="text-sm font-medium">{m.name}</p>}
                      <p className="text-xs text-muted-foreground">{m.identifier}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    >
                      <option value="org:member">Member</option>
                      <option value="org:admin">Admin</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => remove(m.userId)}
                    >
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pending Invitations ({invitations.length})
          </p>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <Card key={inv.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{inv.emailAddress}</span>
                    <Badge variant="outline">{ROLE_LABELS[inv.role] ?? inv.role}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Sent {new Date(inv.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => revoke(inv.id)}>
                    Revoke
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
