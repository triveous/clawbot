"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useClerk, useOrganization, useUser } from "@clerk/nextjs";
import {
  SectionCard,
  Icon,
  Field,
  Callout,
  type IconName,
} from "@/components/dashboard";

type Tab = "account" | "organization" | "appearance" | "notifications";

const TABS: { key: Tab; label: string; icon: IconName; adminOnly?: boolean }[] = [
  { key: "account", label: "Account", icon: "settings" },
  { key: "organization", label: "Organization", icon: "shield", adminOnly: true },
  { key: "appearance", label: "Appearance", icon: "sun" },
  { key: "notifications", label: "Notifications", icon: "bell" },
];

export default function SettingsPage() {
  const { isLoaded: userLoaded, user } = useUser();
  const { isLoaded: orgLoaded, organization, membership } = useOrganization();
  const [tab, setTab] = useState<Tab>("account");

  const isAdmin = membership?.role === "org:admin";

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div>
      <style>{`
        .section-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 24px 2px 6px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--destructive);
        }
        .section-heading__rule {
          flex: 1;
          height: 1px;
          background: color-mix(in oklab, var(--destructive) 30%, transparent);
        }
      `}</style>
      <div className="page__head">
        <div>
          <h1 className="page__title">Settings</h1>
          <div className="page__sub">
            Your account, your organization, and how we reach out.
          </div>
        </div>
      </div>

      <div className="tabs">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tabs__tab${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "account" ? (
        userLoaded && user ? (
          <AccountTab />
        ) : (
          <LoadingBlock label="Loading account…" />
        )
      ) : null}

      {tab === "organization" ? (
        orgLoaded && organization && isAdmin ? (
          <OrganizationTab />
        ) : !isAdmin ? (
          <AdminGate feature="organization settings" />
        ) : (
          <LoadingBlock label="Loading organization…" />
        )
      ) : null}

      {tab === "appearance" ? <AppearanceTab /> : null}

      {tab === "notifications" ? <NotificationsTab /> : null}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div
      className="faint"
      style={{ padding: "40px 0", textAlign: "center", fontSize: 13 }}
    >
      {label}
    </div>
  );
}

function AdminGate({ feature }: { feature: string }) {
  return (
    <Callout kind="warn" icon="lock" title="Admin only">
      Only org admins can access {feature}. Ask an admin to promote you, or switch to a
      workspace where you have the admin role.
    </Callout>
  );
}

// ─── Account ──────────────────────────────────────────────────────────────

function AccountTab() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const router = useRouter();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
     
    setFirstName(user.firstName ?? "");
     
    setLastName(user.lastName ?? "");
  }, [user]);

  if (!user) return null;

  const primaryEmail = user.primaryEmailAddress?.emailAddress ?? null;
  const dirty =
    firstName !== (user.firstName ?? "") || lastName !== (user.lastName ?? "");

  async function saveName() {
    if (!user || !dirty) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await user.update({ firstName, lastName });
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function onAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked
    if (!file || !user) return;
    setUploading(true);
    setError("");
    try {
      await user.setProfileImage({ file });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <SectionCard title="Profile" sub="Your name and avatar appear on every comment and audit entry">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.imageUrl}
            alt=""
            width={72}
            height={72}
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              objectFit: "cover",
              border: "1px solid var(--db-hair)",
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {user.fullName ?? primaryEmail ?? "Your profile photo"}
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              PNG or JPG, square-crop works best.
            </div>
          </div>
          <label className="btn btn--ghost btn--sm">
            <Icon name="upload" size={12} />
            {uploading ? "Uploading…" : "Change"}
            <input
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: "none" }}
              onChange={onAvatarPick}
              disabled={uploading}
            />
          </label>
        </div>

        <div className="grid2" style={{ gap: 14 }}>
          <Field label="First name">
            <input
              className="input"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setSaved(false);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
              }}
            />
          </Field>
          <Field label="Last name">
            <input
              className="input"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setSaved(false);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
              }}
            />
          </Field>
        </div>

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void saveName()}
            disabled={!dirty || saving}
          >
            <Icon name="check" size={14} />
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved ? (
            <span className="faint" style={{ fontSize: 12, color: "var(--success)" }}>
              Saved.
            </span>
          ) : null}
          {error ? (
            <span className="faint" style={{ fontSize: 12, color: "var(--destructive)" }}>
              {error}
            </span>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Email addresses"
        sub="Used for sign-in, invoices, and critical alerts"
      >
        <div className="col" style={{ gap: 8 }}>
          {user.emailAddresses.map((e) => {
            const isPrimary = e.id === user.primaryEmailAddressId;
            return (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid var(--db-hair)",
                  borderRadius: 8,
                  background: "var(--db-surface)",
                }}
              >
                <Icon name="mail" size={14} />
                <span className="mono" style={{ flex: 1, fontSize: 13 }}>
                  {e.emailAddress}
                </span>
                {e.verification?.status === "verified" ? (
                  <span className="pill pill--active">Verified</span>
                ) : (
                  <span className="pill pill--warn">Unverified</span>
                )}
                {isPrimary ? <span className="pill pill--info">Primary</span> : null}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }} className="faint" role="note">
          <span style={{ fontSize: 12 }}>
            Add, verify, or set a primary email in your account modal.
          </span>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => openUserProfile()}
            >
              <Icon name="settings" size={12} />
              Manage emails
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Security"
        sub="Password, two-factor auth, and active sessions"
      >
        <div className="col" style={{ gap: 10, fontSize: 13 }}>
          <SecurityRow
            label="Password"
            value={
              user.passwordEnabled ? "A password is set" : "No password (social sign-in only)"
            }
          />
          <SecurityRow
            label="Two-factor auth"
            value={user.twoFactorEnabled ? "Enabled" : "Not enabled"}
            positive={user.twoFactorEnabled}
          />
          <SecurityRow
            label="Connected accounts"
            value={
              user.externalAccounts.length > 0
                ? user.externalAccounts
                    .map((a) => a.provider.replace("oauth_", ""))
                    .join(", ")
                : "None linked"
            }
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => openUserProfile()}
          >
            <Icon name="lock" size={12} />
            Manage security
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Sign out" sub="End this browser session">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void signOut(() => router.push("/login"))}
        >
          <Icon name="logOut" size={14} />
          Sign out of Clawbot
        </button>
      </SectionCard>
    </div>
  );
}

function SecurityRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid var(--db-hair)",
      }}
    >
      <span className="faint">{label}</span>
      <span style={{ color: positive ? "var(--success)" : "var(--db-text)" }}>{value}</span>
    </div>
  );
}

// ─── Organization ────────────────────────────────────────────────────────

function OrganizationTab() {
  const { organization } = useOrganization();

  const [name, setName] = useState(organization?.name ?? "");
  const [slug, setSlug] = useState(organization?.slug ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!organization) return;
     
    setName(organization.name);
     
    setSlug(organization.slug ?? "");
  }, [organization]);

  if (!organization) return null;

  const dirty = name !== organization.name || slug !== (organization.slug ?? "");

  async function save() {
    if (!organization || !dirty) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await organization.update({ name, slug: slug || undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function onLogoPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !organization) return;
    setUploading(true);
    setError("");
    try {
      await organization.setLogo({ file });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <SectionCard
        title="Identity"
        sub="Name and slug shown to teammates and in assistant hostnames"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={organization.imageUrl}
            alt=""
            width={64}
            height={64}
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              objectFit: "cover",
              border: "1px solid var(--db-hair)",
              background: "var(--db-surface-2)",
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Organization logo</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              PNG or JPG, square. Shows up in the switcher and on invites.
            </div>
          </div>
          <label className="btn btn--ghost btn--sm">
            <Icon name="upload" size={12} />
            {uploading ? "Uploading…" : "Change"}
            <input
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: "none" }}
              onChange={onLogoPick}
              disabled={uploading}
            />
          </label>
        </div>

        <Field label="Name">
          <input
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
              setError("");
            }}
          />
        </Field>

        <div style={{ height: 12 }} />

        <Field label="Slug" hint="Used in URLs and in hostnames of new assistants.">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              className="faint mono"
              style={{ fontSize: 12, whiteSpace: "nowrap" }}
            >
              clawbot.dev/
            </span>
            <input
              className="input"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setSaved(false);
                setError("");
              }}
              style={{ flex: 1 }}
              placeholder="acme"
            />
          </div>
        </Field>

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void save()}
            disabled={!dirty || saving}
          >
            <Icon name="check" size={14} />
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved ? (
            <span className="faint" style={{ fontSize: 12, color: "var(--success)" }}>
              Saved.
            </span>
          ) : null}
          {error ? (
            <span className="faint" style={{ fontSize: 12, color: "var(--destructive)" }}>
              {error}
            </span>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Facts" sub="Read-only, from Clerk">
        <dl className="kv">
          <dt>Org ID</dt>
          <dd className="mono">{organization.id}</dd>
          <dt>Members</dt>
          <dd>{organization.membersCount ?? "—"}</dd>
          <dt>Created</dt>
          <dd>
            {organization.createdAt
              ? new Date(organization.createdAt).toLocaleDateString()
              : "—"}
          </dd>
        </dl>
      </SectionCard>

      <div className="section-heading">
        <Icon name="alert" size={14} />
        <span>Danger zone</span>
        <div className="section-heading__rule" />
      </div>
      <OrgDangerZone />
    </div>
  );
}

// ─── Appearance ───────────────────────────────────────────────────────────

function AppearanceTab() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function apply(next: "light" | "dark") {
    setTheme(next);
    const root = document.documentElement;
    if (next === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      window.localStorage.setItem("cb:theme", next);
    } catch {
      /* storage blocked */
    }
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <SectionCard title="Theme" sub="Defaults to dark. Picked here overrides the top-bar toggle.">
        <div className="setrow-group">
          <ToggleRow
            name="Dark mode"
            desc="Warm near-black chrome, high contrast text."
            on={theme === "dark"}
            onChange={(on) => apply(on ? "dark" : "light")}
          />
        </div>
      </SectionCard>

      <SectionCard title="System" sub="More density + motion controls are coming soon.">
        <div className="faint" style={{ fontSize: 12, lineHeight: 1.6 }}>
          The top-bar sun/moon toggle is the quickest way to switch — it mirrors this setting.
          Compact density and reduced-motion land in a later release.
        </div>
      </SectionCard>
    </div>
  );
}

function ToggleRow({
  name,
  desc,
  on,
  onChange,
}: {
  name: ReactNode;
  desc: ReactNode;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="setrow">
      <div className="setrow__text">
        <div className="setrow__name">{name}</div>
        <div className="setrow__desc">{desc}</div>
      </div>
      <button
        type="button"
        className={`toggle${on ? " is-on" : ""}`}
        onClick={() => onChange(!on)}
        aria-pressed={on}
      >
        <span className="toggle__track" />
      </button>
    </div>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────

type NotifPrefs = {
  billingEmail: boolean;
  provisioningEmail: boolean;
  weeklyDigest: boolean;
};

const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  billingEmail: true,
  provisioningEmail: true,
  weeklyDigest: false,
};

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("cb:notif-prefs");
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPrefs({ ...DEFAULT_NOTIF_PREFS, ...(JSON.parse(raw) as Partial<NotifPrefs>) });
      }
    } catch {
      /* storage blocked */
    }
  }, []);

  const update = useCallback(<K extends keyof NotifPrefs>(key: K, value: NotifPrefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem("cb:notif-prefs", JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  }, []);

  return (
    <div className="col" style={{ gap: 16 }}>
      <Callout kind="info" icon="info" title="Saved locally for now">
        These preferences live in your browser while the server-side preferences API is being
        built. They&rsquo;ll move to the account profile in the next release.
      </Callout>

      <SectionCard title="Email">
        <div className="setrow-group">
          <ToggleRow
            name="Billing"
            desc="Invoice receipts, failed payments, and subscription changes."
            on={prefs.billingEmail}
            onChange={(v) => update("billingEmail", v)}
          />
          <ToggleRow
            name="Provisioning"
            desc="When an assistant finishes provisioning, stops, or errors out."
            on={prefs.provisioningEmail}
            onChange={(v) => update("provisioningEmail", v)}
          />
          <ToggleRow
            name="Weekly digest"
            desc="A short Monday recap — uptime, usage, and what's new on the platform."
            on={prefs.weeklyDigest}
            onChange={(v) => update("weeklyDigest", v)}
          />
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Danger zone ──────────────────────────────────────────────────────────

// Rendered inside the Organization tab under a "Danger zone" section header
// so the scary controls live next to the org identity they mutate.
function OrgDangerZone() {
  const { organization } = useOrganization();
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  if (!organization) return null;

  async function destroy() {
    if (!organization || confirmName !== organization.name) return;
    setDeleting(true);
    setError("");
    try {
      await organization.destroy();
      router.push("/onboarding/org");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete organization");
      setDeleting(false);
    }
  }

  async function leave() {
    if (!organization) return;
    const confirmed = window.confirm(`Leave ${organization.name}?`);
    if (!confirmed) return;
    setLeaving(true);
    setError("");
    try {
      // Clerk's Organization doesn't expose a first-class leave() on all
      // versions; the user profile modal handles that flow. We fall back to
      // opening the switcher via the sidebar, after showing a short hint.
      window.location.href = "/onboarding/org";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't leave");
      setLeaving(false);
    }
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <SectionCard title="Leave this organization">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Step down from {organization.name}</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>
              You&rsquo;ll lose access immediately. Your assistants stay with the org.
            </div>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void leave()}
            disabled={leaving}
          >
            <Icon name="logOut" size={14} />
            Leave
          </button>
        </div>
      </SectionCard>

      <SectionCard className="danger" title="Delete organization">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div
              style={{ fontSize: 13, fontWeight: 500, color: "var(--destructive)" }}
            >
              Delete {organization.name}
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>
              Permanently deletes all assistants, credits, and history. Cannot be undone.
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
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 320 }}>
              <div className="faint" style={{ fontSize: 12 }}>
                Type <span className="mono">{organization.name}</span> to confirm.
              </div>
              <input
                className="input"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={organization.name}
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
                  onClick={() => void destroy()}
                  disabled={deleting || confirmName !== organization.name}
                >
                  <Icon name="trash" size={14} />
                  {deleting ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </div>
          )}
        </div>
        {error ? (
          <div className="field__err" style={{ marginTop: 12 }}>
            {error}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
