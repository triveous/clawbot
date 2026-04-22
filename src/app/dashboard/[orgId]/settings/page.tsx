"use client";

import { use, useEffect, useState } from "react";
import { OrganizationProfile, UserProfile } from "@clerk/nextjs";
import {
  SectionCard,
  Icon,
  Callout,
  Segmented,
  Field,
} from "@/components/dashboard";

type Tab = "account" | "organization" | "notifications";

const TABS = [
  { value: "account" as const, label: "Account" },
  { value: "organization" as const, label: "Organization" },
  { value: "notifications" as const, label: "Notifications" },
];

type NotifPrefs = {
  billingEmail: boolean;
  provisioningEmail: boolean;
  weeklyDigest: boolean;
};

const DEFAULT_PREFS: NotifPrefs = {
  billingEmail: true,
  provisioningEmail: true,
  weeklyDigest: false,
};

function readPrefs(): NotifPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem("cb:notif-prefs");
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotifPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function SettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId: _orgId } = use(params);
  const [tab, setTab] = useState<Tab>("account");
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(readPrefs());
  }, []);

  function updatePref<K extends keyof NotifPrefs>(key: K, value: NotifPrefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      window.localStorage.setItem("cb:notif-prefs", JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  }

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">Settings</h1>
          <div className="page__sub">
            Your account, your organization, and how we reach out.
          </div>
        </div>
        <div className="page__actions">
          <Segmented value={tab} onChange={setTab} options={TABS} />
        </div>
      </div>

      {tab === "account" ? (
        <SectionCard
          title="Account"
          sub="Name, email, password, and connected accounts — managed by Clerk"
          pad={false}
        >
          <div style={{ padding: 0 }}>
            <UserProfile
              routing="hash"
              appearance={{
                variables: {
                  colorBackground: "var(--card)",
                  colorText: "var(--foreground)",
                  colorPrimary: "var(--primary)",
                  fontFamily: "var(--font-geist-sans)",
                  borderRadius: "10px",
                },
                elements: {
                  rootBox: "w-full",
                  cardBox: "shadow-none border-none",
                },
              }}
            />
          </div>
        </SectionCard>
      ) : null}

      {tab === "organization" ? (
        <SectionCard
          title="Organization"
          sub="Name, members, domains, and org-level settings — managed by Clerk"
          pad={false}
        >
          <OrganizationProfile
            routing="hash"
            appearance={{
              variables: {
                colorBackground: "var(--card)",
                colorText: "var(--foreground)",
                colorPrimary: "var(--primary)",
                fontFamily: "var(--font-geist-sans)",
                borderRadius: "10px",
              },
              elements: {
                rootBox: "w-full",
                cardBox: "shadow-none border-none",
              },
            }}
          />
        </SectionCard>
      ) : null}

      {tab === "notifications" ? (
        <div className="col" style={{ gap: 16 }}>
          <Callout kind="info" icon="info" title="Saved locally for now">
            Your notification preferences are stored in the browser while the server-side
            preferences API is being built. They&rsquo;ll move to the account profile in the
            next release.
          </Callout>

          <SectionCard title="Email">
            <div className="col" style={{ gap: 14 }}>
              <PrefRow
                title="Billing"
                desc="Invoice receipts, failed payments, and subscription changes."
                value={prefs.billingEmail}
                onChange={(v) => updatePref("billingEmail", v)}
              />
              <PrefRow
                title="Provisioning"
                desc="When an assistant finishes provisioning, stops, or errors out."
                value={prefs.provisioningEmail}
                onChange={(v) => updatePref("provisioningEmail", v)}
              />
              <PrefRow
                title="Weekly digest"
                desc="A short Monday recap — uptime, usage, and what's new on the platform."
                value={prefs.weeklyDigest}
                onChange={(v) => updatePref("weeklyDigest", v)}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="In-app"
            sub="These already show up in the notification bell."
          >
            <Field label="Alerts" hint="Warnings and errors that need your attention.">
              <div
                className="faint"
                style={{ fontSize: 12, padding: "8px 0", lineHeight: 1.5 }}
              >
                Always on. You can filter the inbox to alerts from the bell menu.
              </div>
            </Field>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

function PrefRow({
  title,
  desc,
  value,
  onChange,
}: {
  title: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        borderBottom: "1px solid var(--db-hair)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div className="faint" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>
          {desc}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 999,
          border: "1px solid var(--db-hair)",
          background: value ? "var(--primary)" : "var(--muted)",
          position: "relative",
          cursor: "pointer",
          transition: "background 120ms var(--ease-claw)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: value ? 20 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "var(--card)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
            transition: "left 120ms var(--ease-claw)",
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: value ? "flex-start" : "flex-end",
            padding: "0 4px",
            fontSize: 8,
            color: "transparent",
          }}
        >
          <Icon name={value ? "check" : "x"} size={10} />
        </span>
      </button>
    </div>
  );
}
