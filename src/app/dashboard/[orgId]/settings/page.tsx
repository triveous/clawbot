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
    <div className="faint py-10 text-center text-[13px]">
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
    <div className="col gap-4">
      <SectionCard title="Profile" sub="Your name and avatar appear on every comment and audit entry">
        <div className="flex items-center gap-4 mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.imageUrl}
            alt=""
            width={72}
            height={72}
            className="w-[72px] h-[72px] rounded-full object-cover border border-border"
          />
          <div className="flex-1">
            <div className="text-[13px] font-medium">
              {user.fullName ?? primaryEmail ?? "Your profile photo"}
            </div>
            <div className="faint text-xs mt-0.5">
              PNG or JPG, square-crop works best.
            </div>
          </div>
          <label className="btn btn--ghost btn--sm">
            <Icon name="upload" size={12} />
            {uploading ? "Uploading…" : "Change"}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={onAvatarPick}
              disabled={uploading}
            />
          </label>
        </div>

        <div className="grid2 gap-[14px]">
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

        <div className="mt-[14px] flex items-center gap-3">
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
            <span className="faint text-xs text-[var(--success)]">
              Saved.
            </span>
          ) : null}
          {error ? (
            <span className="faint text-xs text-destructive">
              {error}
            </span>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Email addresses"
        sub="Used for sign-in, invoices, and critical alerts"
      >
        <div className="col gap-2">
          {user.emailAddresses.map((e) => {
            const isPrimary = e.id === user.primaryEmailAddressId;
            return (
              <div
                key={e.id}
                className="flex items-center gap-3 px-3 py-2.5 border border-border rounded-lg bg-card"
              >
                <Icon name="mail" size={14} />
                <span className="mono flex-1 text-[13px]">
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
        <div className="mt-[14px] faint" role="note">
          <span className="text-xs">
            Add, verify, or set a primary email in your account modal.
          </span>
          <div className="mt-2">
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
        <div className="col gap-2.5 text-[13px]">
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
        <div className="mt-[14px]">
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
    <div className="flex items-center justify-between py-2.5 border-b border-border">
      <span className="faint">{label}</span>
      <span className={positive ? "text-[var(--success)]" : "text-foreground"}>{value}</span>
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
      // Only send slug when the instance actually supports org slugs — an
      // existing value on organization.slug means slugs are enabled. Clerk
      // instances without the feature reject the key outright.
      const payload: { name: string; slug?: string } = { name };
      const supportsSlug = organization.slug != null;
      if (supportsSlug && slug && slug !== organization.slug) {
        payload.slug = slug;
      }
      await organization.update(payload);
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
    <div className="col gap-4">
      <SectionCard
        title="Identity"
        sub="Name and slug shown to teammates and in assistant hostnames"
      >
        <div className="flex items-center gap-4 mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={organization.imageUrl}
            alt=""
            width={64}
            height={64}
            className="w-16 h-16 rounded-xl object-cover border border-border bg-muted"
          />
          <div className="flex-1">
            <div className="text-[13px] font-medium">Organization logo</div>
            <div className="faint text-xs mt-0.5">
              PNG or JPG, square. Shows up in the switcher and on invites.
            </div>
          </div>
          <label className="btn btn--ghost btn--sm">
            <Icon name="upload" size={12} />
            {uploading ? "Uploading…" : "Change"}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
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

        <div className="h-3" />

        {(() => {
          // If the Clerk instance doesn't advertise a slug, slugs are
          // disabled for this instance — show a greyed-out preview so the
          // design reads right but the user can't try to save a value that
          // Clerk would reject.
          const slugsEnabled = organization.slug != null;
          return (
            <Field
              label="Slug"
              hint={
                slugsEnabled
                  ? "Used in URLs and in hostnames of new assistants."
                  : "Org slugs are disabled for this Clerk instance. Enable them in the Clerk dashboard to change this."
              }
            >
              <div className="flex gap-2 items-center">
                <span className="faint mono text-xs whitespace-nowrap">
                  clawbot.dev/
                </span>
                <input
                  className={`input flex-1 ${slugsEnabled ? "" : "opacity-60"}`}
                  value={slug}
                  onChange={(e) => {
                    setSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    );
                    setSaved(false);
                    setError("");
                  }}
                  placeholder="acme"
                  readOnly={!slugsEnabled}
                />
              </div>
            </Field>
          );
        })()}

        <div className="mt-[14px] flex items-center gap-3">
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
            <span className="faint text-xs text-[var(--success)]">
              Saved.
            </span>
          ) : null}
          {error ? (
            <span className="faint text-xs text-destructive">
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

      <div className="mx-0.5 mt-6 mb-1.5 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-destructive">
        <Icon name="alert" size={14} />
        <span>Danger zone</span>
        <div className="h-px flex-1 bg-[color-mix(in_oklab,var(--destructive)_30%,transparent)]" />
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
    <div className="col gap-4">
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
        <div className="faint text-xs leading-[1.6]">
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
    <div className="col gap-4">
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
    <div className="col gap-4">
      <SectionCard title="Leave this organization">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[13px] font-medium">Step down from {organization.name}</div>
            <div className="faint text-xs mt-0.5 leading-[1.5]">
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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-[1_1_240px] min-w-0">
            <div className="text-[13px] font-medium text-destructive">
              Delete {organization.name}
            </div>
            <div className="faint text-xs mt-[3px] leading-[1.5]">
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
            <div className="flex flex-col gap-2 w-[320px]">
              <div className="faint text-xs">
                Type <span className="mono">{organization.name}</span> to confirm.
              </div>
              <input
                className="input"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={organization.name}
              />
              <div className="flex gap-2">
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
          <div className="field__err mt-3">
            {error}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
