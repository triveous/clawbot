"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listMembers,
  listInvitations,
  inviteMember,
  revokeInvitation,
  removeMember,
  updateMemberRole,
} from "./actions";
import {
  SectionCard,
  Icon,
  Field,
  Callout,
  RowMenu,
  type RowMenuItem,
} from "@/components/dashboard";
import { formatDate } from "@/lib/dashboard/format";

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

function avatarInitials(name: string | null, identifier: string) {
  const src = name?.trim() || identifier;
  return (
    src
      .split(/\s+/)
      .map((s) => s[0]?.toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join("") || "?"
  );
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

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

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    if (!email.trim()) return;
    setInviting(true);
    setInviteError("");
    setInviteSuccess("");
    try {
      await inviteMember(email.trim(), role);
      setInviteSuccess(`Invitation sent to ${email.trim()}`);
      setEmail("");
      await load();
    } catch (e) {
      setInviteError(String(e).replace("Error: ", ""));
    } finally {
      setInviting(false);
    }
  }

  async function revoke(invitationId: string) {
    setActionError("");
    try {
      await revokeInvitation(invitationId);
      await load();
    } catch (e) {
      setActionError(String(e).replace("Error: ", ""));
    }
  }

  async function remove(memberUserId: string) {
    setActionError("");
    try {
      await removeMember(memberUserId);
      await load();
    } catch (e) {
      setActionError(String(e).replace("Error: ", ""));
    }
  }

  async function changeRole(memberUserId: string, newRole: string) {
    setActionError("");
    try {
      await updateMemberRole(memberUserId, newRole);
      await load();
    } catch (e) {
      setActionError(String(e).replace("Error: ", ""));
    }
  }

  if (forbidden) {
    return (
      <div>
        <div className="page__head">
          <div>
            <h1 className="page__title">Members</h1>
            <div className="page__sub">Organization membership and invites.</div>
          </div>
        </div>
        <Callout kind="warn" icon="lock" title="Admin only">
          Only org admins can manage members. Ask an admin to add you, or switch to an org
          where you have the admin role.
        </Callout>
      </div>
    );
  }

  const admins = members.filter((m) => m.role === "org:admin").length;

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Members{" "}
            <span className="faint" style={{ fontSize: 20, fontWeight: 400 }}>
              {members.length}
            </span>
          </h1>
          <div className="page__sub">
            {admins} admin{admins !== 1 ? "s" : ""} · {members.length - admins} member
            {members.length - admins !== 1 ? "s" : ""}
            {invitations.length > 0
              ? ` · ${invitations.length} pending invite${invitations.length > 1 ? "s" : ""}`
              : ""}
          </div>
        </div>
      </div>

      {actionError ? (
        <div style={{ marginBottom: 16 }}>
          <Callout kind="danger" icon="alert">
            {actionError}
          </Callout>
        </div>
      ) : null}

      <SectionCard title="Invite a teammate" sub="They'll get an email with a join link">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px", minWidth: 220 }}>
            <Field label="Email">
              <input
                type="email"
                className="input"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setInviteError("");
                  setInviteSuccess("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void invite();
                }}
              />
            </Field>
          </div>
          <Field label="Role">
            <select
              className="select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="org:member">Member</option>
              <option value="org:admin">Admin</option>
            </select>
          </Field>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void invite()}
            disabled={inviting || !email.trim()}
          >
            <Icon name="send" size={14} />
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </div>
        {inviteSuccess ? (
          <div
            className="faint"
            style={{ color: "var(--success)", fontSize: 12, marginTop: 10 }}
          >
            {inviteSuccess}
          </div>
        ) : null}
        {inviteError ? (
          <div className="field__err" style={{ marginTop: 10 }}>
            {inviteError}
          </div>
        ) : null}
      </SectionCard>

      <div style={{ marginTop: 20 }}>
        <SectionCard title="Members" sub={`${members.length} total`} pad={false}>
          {loading ? (
            <div style={{ padding: 24, color: "var(--muted-foreground)", fontSize: 13 }}>
              Loading…
            </div>
          ) : members.length === 0 ? (
            <div style={{ padding: 24, color: "var(--muted-foreground)", fontSize: 13 }}>
              No members.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const menu: RowMenuItem[] = [
                    {
                      label: m.role === "org:admin" ? "Demote to member" : "Promote to admin",
                      icon: "shield",
                      onClick: () =>
                        void changeRole(
                          m.userId,
                          m.role === "org:admin" ? "org:member" : "org:admin",
                        ),
                    },
                    { divider: true },
                    {
                      label: "Remove from org",
                      icon: "trash",
                      destructive: true,
                      onClick: () => void remove(m.userId),
                    },
                  ];
                  return (
                    <tr key={m.membershipId}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {m.imageUrl ? (
                            /* Clerk-hosted avatar — small (32px) and served
                               through img.clerk.com; no optimiser needed. */
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.imageUrl}
                              alt=""
                              width={32}
                              height={32}
                              style={{
                                borderRadius: "50%",
                                display: "block",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div className="userchip__avatar">
                              {avatarInitials(m.name, m.identifier)}
                            </div>
                          )}
                          <div>
                            {m.name ? (
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                            ) : null}
                            <div
                              className="faint"
                              style={{ fontSize: 12, fontFamily: "var(--font-geist-mono)" }}
                            >
                              {m.identifier}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          className="select"
                          value={m.role}
                          onChange={(e) => void changeRole(m.userId, e.target.value)}
                          style={{ maxWidth: 140 }}
                        >
                          <option value="org:member">Member</option>
                          <option value="org:admin">Admin</option>
                        </select>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <RowMenu items={menu} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>

      {invitations.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <SectionCard
            title="Pending invitations"
            sub={`${invitations.length} waiting for a response`}
            pad={false}
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Sent</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono">{inv.emailAddress}</td>
                    <td>
                      <span className="pill pill--default">
                        {ROLE_LABELS[inv.role] ?? inv.role}
                      </span>
                    </td>
                    <td className="dim">{formatDate(new Date(inv.createdAt).toISOString())}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void revoke(inv.id)}
                      >
                        <Icon name="x" size={12} />
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
