"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SkeletonRow } from "@/components/ui/skeleton";
import { useAsyncAction } from "@/hooks/use-async-action";
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
  const [firstLoad, setFirstLoad] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("org:member");
  const [inviteError, setInviteError] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [m, inv] = await Promise.all([listMembers(), listInvitations()]);
      setMembers(m);
      setInvitations(inv);
    } catch (e) {
      if (String(e).includes("Forbidden")) {
        setForbidden(true);
        return;
      }
      throw e;
    }
  }, []);

  const load = useAsyncAction(fetchAll, {
    successToast: false,
    errorToast: "Could not load members",
  });

  useEffect(() => {
    void load.run().finally(() => setFirstLoad(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invite = useAsyncAction(
    async () => {
      const target = email.trim();
      if (!target) return "";
      await inviteMember(target, role);
      setEmail("");
      setInviteError("");
      await fetchAll();
      return target;
    },
    {
      successToast: (target) =>
        target ? `Invitation sent to ${target as string}` : "",
      errorToast: false,
    },
  );

  const revoke = useAsyncAction(
    async (invitationId: string) => {
      await revokeInvitation(invitationId);
      await fetchAll();
    },
    {
      successToast: "Invitation revoked",
      errorToast: "Could not revoke — try again",
    },
  );

  const remove = useAsyncAction(
    async (userId: string) => {
      await removeMember(userId);
      await fetchAll();
    },
    {
      successToast: "Member removed",
      errorToast: "Could not remove — try again",
    },
  );

  async function changeRole(memberUserId: string, newRole: string) {
    // Optimistic update — apply locally, revert on failure.
    const prev = members;
    setMembers((ms) =>
      ms.map((m) => (m.userId === memberUserId ? { ...m, role: newRole } : m)),
    );
    try {
      await updateMemberRole(memberUserId, newRole);
      toast.success("Role updated");
    } catch (e) {
      setMembers(prev);
      toast.error(String(e).replace("Error: ", "") || "Could not update role");
    }
  }

  const [pendingRowId, setPendingRowId] = useState<string | null>(null);

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
            <span className="faint text-xl font-normal">
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

      <SectionCard title="Invite a teammate" sub="They'll get an email with a join link">
        <div className="flex gap-2.5 items-end flex-wrap">
          <div className="flex-[1_1_280px] min-w-[220px]">
            <Field label="Email">
              <input
                type="email"
                className="input"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setInviteError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email.trim())
                    void invite
                      .run()
                      .catch((err) =>
                        setInviteError(String(err).replace("Error: ", "")),
                      );
                }}
              />
            </Field>
          </div>
          <Field label="Role">
            <Select
              value={role}
              onValueChange={(v) => {
                if (v) setRole(v);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org:member">Member</SelectItem>
                <SelectItem value="org:admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              void invite
                .run()
                .catch((err) => setInviteError(String(err).replace("Error: ", "")))
            }
            disabled={invite.loading || !email.trim()}
            aria-busy={invite.loading || undefined}
          >
            {invite.loading ? <Spinner size="xs" /> : <Icon name="send" size={14} />}
            Send invite
          </button>
        </div>
        {inviteError ? (
          <div className="field__err mt-2.5">{inviteError}</div>
        ) : null}
      </SectionCard>

      <div className="mt-5">
        <SectionCard title="Members" sub={`${members.length} total`} pad={false}>
          {firstLoad ? (
            <div className="p-4">
              <SkeletonRow rows={4} avatar />
            </div>
          ) : members.length === 0 ? (
            <div className="p-6 text-muted-foreground text-[13px]">
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
                  const rowBusy = pendingRowId === m.userId && remove.loading;
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
                      onClick: async () => {
                        if (
                          !confirm(
                            `Remove ${m.name ?? m.identifier} from the org?`,
                          )
                        )
                          return;
                        setPendingRowId(m.userId);
                        try {
                          await remove.run(m.userId);
                        } catch {
                          /* toast handled */
                        } finally {
                          setPendingRowId(null);
                        }
                      },
                    },
                  ];
                  return (
                    <tr key={m.membershipId}>
                      <td>
                        <div className="flex items-center gap-3">
                          {m.imageUrl ? (
                            /* Clerk-hosted avatar — small (32px) and served
                               through img.clerk.com; no optimiser needed. */
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.imageUrl}
                              alt=""
                              width={32}
                              height={32}
                              className="rounded-full block object-cover"
                            />
                          ) : (
                            <div className="userchip__avatar">
                              {avatarInitials(m.name, m.identifier)}
                            </div>
                          )}
                          <div>
                            {m.name ? (
                              <div className="text-[13px] font-medium">{m.name}</div>
                            ) : null}
                            <div className="faint text-xs font-mono">
                              {m.identifier}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Select
                          value={m.role}
                          onValueChange={(v) => {
                            if (v) void changeRole(m.userId, v);
                          }}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="org:member">Member</SelectItem>
                            <SelectItem value="org:admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="text-right">
                        {rowBusy ? (
                          <span
                            className="inline-flex items-center gap-2 text-muted-foreground text-xs"
                            aria-busy="true"
                          >
                            <Spinner size="xs" />
                            Removing
                          </span>
                        ) : (
                          <RowMenu items={menu} />
                        )}
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
        <div className="mt-5">
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
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={async () => {
                          setPendingRowId(inv.id);
                          try {
                            await revoke.run(inv.id);
                          } catch {
                            /* toast handled */
                          } finally {
                            setPendingRowId(null);
                          }
                        }}
                        disabled={pendingRowId === inv.id && revoke.loading}
                        aria-busy={
                          pendingRowId === inv.id && revoke.loading
                            ? true
                            : undefined
                        }
                      >
                        {pendingRowId === inv.id && revoke.loading ? (
                          <Spinner size="xs" />
                        ) : (
                          <Icon name="x" size={12} />
                        )}
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
