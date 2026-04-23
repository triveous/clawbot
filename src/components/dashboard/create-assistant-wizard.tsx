"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRpc } from "@/hooks/use-rpc";
import { Icon } from "./icon";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/dashboard/format";
import type { AccessMode } from "@/types/assistant";

type Plan = {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  priceCents: number;
  currency: string;
  providerSpec?: {
    hetzner?: {
      serverType?: string;
      cpu?: string;
      mem?: string;
      disk?: string;
    };
  };
};

type Credit = {
  planId: string;
  status: string;
  consumedByAssistantId: string | null;
  currentPeriodEnd: string | null;
};

type Region = {
  code: string;
  label: string;
  country: string;
  flag: string;
  ping: string;
};

// Backend only accepts fsn1 / nbg1 / hel1 today; keep flags + ping from design
// so the UI reads as intended but grey-out US regions until the backend opens
// up.
const REGIONS: (Region & { available: boolean })[] = [
  { code: "fsn1", label: "Falkenstein", country: "Germany", flag: "🇩🇪", ping: "12ms", available: true },
  { code: "nbg1", label: "Nuremberg", country: "Germany", flag: "🇩🇪", ping: "14ms", available: true },
  { code: "hel1", label: "Helsinki", country: "Finland", flag: "🇫🇮", ping: "38ms", available: true },
];

const SUGGESTIONS = ["personal-claw", "research-assistant", "slack-ops", "inbox-triage", "briefing-bot"];

export function CreateAssistantWizard({
  orgId,
  isFirst,
  open,
  onClose,
  onDeployed,
}: {
  orgId: string;
  isFirst?: boolean;
  open: boolean;
  onClose: () => void;
  onDeployed: (assistantId: string) => void;
}) {
  const rpc = useRpc();
  const router = useRouter();

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState<string>("");
  const [region, setRegion] = useState<string>("fsn1");
  const [access, setAccess] = useState<AccessMode>("ssh");
  const [sshAllowedIps, setSshAllowedIps] = useState("0.0.0.0/0");
  const [tailscaleKey, setTailscaleKey] = useState("");

  const [plans, setPlans] = useState<Plan[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [phase, setPhase] = useState<"form" | "deploying">("form");
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const [deployError, setDeployError] = useState("");
  const [needCredit, setNeedCredit] = useState(false);

  // Load plans + credits when opened
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingMeta(true);
    void (async () => {
      try {
        const [pRes, cRes] = await Promise.all([rpc.api.plans.$get(), rpc.api.credits.$get()]);
        if (cancelled) return;
        if (pRes.ok) {
          const pd = (await pRes.json()) as { plans: Plan[] };
          setPlans(pd.plans);
          if (pd.plans.length > 0) setPlanId((prev) => prev || pd.plans[0].id);
        }
        if (cRes.ok) {
          const cd = (await cRes.json()) as { credits: Credit[] };
          setCredits(cd.credits);
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rpc]);

  const selectedPlan = plans.find((p) => p.id === planId) ?? null;

  const availableByPlan = useMemo(() => {
    const now = Date.now();
    const m = new Map<string, number>();
    for (const c of credits) {
      if (
        c.status === "active" &&
        !c.consumedByAssistantId &&
        c.currentPeriodEnd &&
        new Date(c.currentPeriodEnd).getTime() > now
      ) {
        m.set(c.planId, (m.get(c.planId) ?? 0) + 1);
      }
    }
    return m;
  }, [credits]);

  const selectedPlanCredit = selectedPlan ? (availableByPlan.get(selectedPlan.id) ?? 0) : 0;

  const safeName = (name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "my-first-assistant");
  const hostname = `${safeName}.clawbot.dev`;

  const canNext = [
    () => !!name.trim(),
    () => !!planId,
    () => !!region && (access === "ssh" ? true : !!tailscaleKey.trim()),
  ][step]();

  const deploy = useCallback(async () => {
    if (!selectedPlan || !canNext) return;
    setPhase("deploying");
    setDeployError("");
    try {
      const body: Record<string, string> = {
        name: safeName,
        planId: selectedPlan.id,
        region,
        accessMode: access,
      };
      if (access === "ssh" && sshAllowedIps.trim()) body.sshAllowedIps = sshAllowedIps.trim();
      if (access === "tailscale_serve") body.tailscaleAuthKey = tailscaleKey.trim();

      const res = await rpc.api.assistants.$post({ json: body });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        setDeployError(err.message ?? "Failed to deploy");
        setPhase("form");
        return;
      }
      const data = (await res.json()) as { assistant?: { id: string }; id?: string };
      const id = data.assistant?.id ?? data.id;
      if (!id) {
        setDeployError("Server did not return an assistant id.");
        setPhase("form");
        return;
      }
      // Keep the deploying scene mounted and let it poll the assistant
      // until it's active or errors out. The user can bail to the home
      // screen any time via the "Notify me" action — we don't auto-route.
      setDeployedId(id);
    } catch {
      setDeployError("Failed to deploy");
      setPhase("form");
    }
  }, [
    selectedPlan,
    canNext,
    safeName,
    region,
    access,
    sshAllowedIps,
    tailscaleKey,
    rpc,
    onDeployed,
  ]);

  const next = useCallback(() => {
    if (step === 1 && selectedPlanCredit === 0) {
      setNeedCredit(true);
      return;
    }
    if (step < 2) setStep((s) => (s < 2 ? ((s + 1) as 0 | 1 | 2) : s));
    else void deploy();
  }, [step, selectedPlanCredit, deploy]);

  const back = useCallback(() => {
    if (step > 0) setStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2) : s));
    else onClose();
  }, [step, onClose]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "form") return;
      if (needCredit) {
        if (e.key === "Escape") setNeedCredit(false);
        return;
      }
      if (e.key === "Enter" && canNext && !e.shiftKey) {
        e.preventDefault();
        next();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canNext, next, onClose, phase, needCredit]);

  if (!open) return null;
  if (phase === "deploying" && selectedPlan) {
    return (
      <DeployingScene
        name={safeName}
        hostname={hostname}
        plan={selectedPlan}
        region={region}
        assistantId={deployedId}
        onBackToList={() => {
          onClose();
          if (deployedId) onDeployed(deployedId);
        }}
        onCancel={() => {
          setDeployedId(null);
          setPhase("form");
        }}
        onOpenAssistant={() => {
          if (deployedId) onDeployed(deployedId);
        }}
      />
    );
  }

  return (
    <div className="faw">
      <div className="faw__bg" aria-hidden />

      <div className="faw__top">
        <div className="faw__top-brand">
          <Icon name="bot" size={18} />
          <span>Clawbot</span>
          <span className="faw__top-chev">
            <Icon name="chevRight" size={12} />
          </span>
          <span className="faw__top-crumb">
            {isFirst ? "Create your first assistant" : "New assistant"}
          </span>
        </div>
        <button type="button" className="faw__close" onClick={onClose} title="Cancel" aria-label="Cancel">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="faw__rail">
        {["Name", "Plan", "Access"].map((label, i) => (
          <div
            key={label}
            className={`faw__rail-step${i === step ? " is-current" : ""}${i < step ? " is-done" : ""}`}
          >
            <div className="faw__rail-dot">
              {i < step ? <Icon name="check" size={11} /> : String(i + 1)}
            </div>
            <div className="faw__rail-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="faw__content">
        <div className="faw__form">
          {loadingMeta ? (
            <div className="p-10 space-y-4" role="status" aria-busy="true">
              <Skeleton className="h-6 w-40" />
              <SkeletonText lines={3} />
              <div className="grid gap-2 sm:grid-cols-3">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
              <span className="sr-only">Loading plans</span>
            </div>
          ) : plans.length === 0 ? (
            <div className="faw__step">
              <div className="faw__eyebrow">Setup needed</div>
              <h1 className="faw__h">No plans configured</h1>
              <p className="faw__p">
                Ask an admin to create a plan in the Admin console before you can deploy.
              </p>
            </div>
          ) : step === 0 ? (
            <StepName name={name} setName={setName} hostname={hostname} />
          ) : step === 1 ? (
            <StepPlan
              plans={plans}
              planId={planId}
              setPlanId={setPlanId}
              availableByPlan={availableByPlan}
            />
          ) : (
            <StepAccess
              region={region}
              setRegion={setRegion}
              access={access}
              setAccess={setAccess}
              sshAllowedIps={sshAllowedIps}
              setSshAllowedIps={setSshAllowedIps}
              tailscaleKey={tailscaleKey}
              setTailscaleKey={setTailscaleKey}
            />
          )}

          <div className="faw__foot">
            <button type="button" className="faw__back" onClick={back}>
              <Icon name="chevLeft" size={14} />
              {step === 0 ? "Cancel" : "Back"}
            </button>
            <div className="faw__foot-hint">
              <span className="faw__kbd">↵</span> to continue
            </div>
            <button
              type="button"
              className={`faw__next${canNext ? "" : " is-disabled"}`}
              onClick={next}
              disabled={!canNext || plans.length === 0}
            >
              {step === 2 ? "Deploy assistant" : "Continue"}
              <Icon name={step === 2 ? "zap" : "chevRight"} size={14} />
            </button>
          </div>

          {deployError ? (
            <div className="field__err mt-2.5">
              {deployError}
            </div>
          ) : null}
        </div>

        <div className="faw__preview">
          <PreviewCard
            name={safeName}
            hostname={hostname}
            plan={selectedPlan}
            region={region}
            access={access}
            step={step}
          />
        </div>
      </div>

      {needCredit && selectedPlan ? (
        <NeedCreditModal
          plan={selectedPlan}
          orgId={orgId}
          onClose={() => setNeedCredit(false)}
          onNavigate={() => {
            setNeedCredit(false);
            onClose();
            router.push(`/dashboard/${orgId}/pricing`);
          }}
        />
      ) : null}
    </div>
  );
}

function StepName({
  name,
  setName,
  hostname,
}: {
  name: string;
  setName: (v: string) => void;
  hostname: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="faw__step">
      <div className="faw__eyebrow">Step 1 of 3</div>
      <h1 className="faw__h">
        What should we <em>call</em> it?
      </h1>
      <p className="faw__p">
        Lowercase letters, numbers, hyphens. This becomes your hostname — you can&rsquo;t change it
        later.
      </p>

      <div className="faw__big-input">
        <input
          ref={ref}
          className="faw__big-input-el"
          placeholder="my-first-assistant"
          value={name}
          maxLength={40}
          onChange={(e) =>
            setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40))
          }
        />
        <span className="faw__big-input-tld">.clawbot.dev</span>
      </div>

      <div className="faw__suggest">
        <span className="faw__suggest-label">Or try</span>
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="faw__suggest-chip" onClick={() => setName(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="faw__tips">
        <div className="faw__tip">
          <Icon name="info" size={13} />
          <span>
            Good names describe what the assistant <em>does</em> — not what it <em>is</em>.{" "}
            <code>inbox-triage</code> beats <code>claude-assistant-v3</code>.
          </span>
        </div>
        <div className="faw__tip">
          <Icon name="globe" size={13} />
          <span>
            Hostname preview: <code>{hostname}</code>
          </span>
        </div>
      </div>
    </div>
  );
}

function StepPlan({
  plans,
  planId,
  setPlanId,
  availableByPlan,
}: {
  plans: Plan[];
  planId: string;
  setPlanId: (id: string) => void;
  availableByPlan: Map<string, number>;
}) {
  return (
    <div className="faw__step">
      <div className="faw__eyebrow">Step 2 of 3</div>
      <h1 className="faw__h">
        Pick a <em>box</em> to run on.
      </h1>
      <p className="faw__p">
        Consumes one credit. Upgrade or downgrade any time — your data moves with you.
      </p>

      <div className="faw__plans">
        {plans.slice(0, 3).map((p) => {
          const active = planId === p.id;
          const credits = availableByPlan.get(p.id) ?? 0;
          const hetz = p.providerSpec?.hetzner;
          return (
            <button
              type="button"
              key={p.id}
              className={`faw__plan${active ? " is-active" : ""}`}
              onClick={() => setPlanId(p.id)}
            >
              {credits > 0 ? (
                <span className="faw__plan-badge">
                  {credits} credit{credits > 1 ? "s" : ""} ready
                </span>
              ) : null}
              <div className="faw__plan-head">
                <div className="faw__plan-name">{p.displayName}</div>
                <div className="faw__plan-price">
                  {formatPrice(p.priceCents, p.currency)}
                  <span>/mo</span>
                </div>
              </div>
              <div className="faw__plan-tagline">{p.tagline ?? ""}</div>
              <dl className="faw__plan-specs">
                <div>
                  <dt>CPU</dt>
                  <dd>{hetz?.cpu ?? "—"}</dd>
                </div>
                <div>
                  <dt>RAM</dt>
                  <dd>{hetz?.mem ?? "—"}</dd>
                </div>
                <div>
                  <dt>Disk</dt>
                  <dd>{hetz?.disk ?? "—"}</dd>
                </div>
              </dl>
              <div className="faw__plan-radio">{active ? <Icon name="check" size={14} /> : null}</div>
            </button>
          );
        })}
      </div>

      {plans.length > 3 ? (
        <div className="faw__plan-link">
          See all plans in the <span className="mono">Pricing</span> tab.
        </div>
      ) : null}
    </div>
  );
}

function StepAccess({
  region,
  setRegion,
  access,
  setAccess,
  sshAllowedIps,
  setSshAllowedIps,
  tailscaleKey,
  setTailscaleKey,
}: {
  region: string;
  setRegion: (r: string) => void;
  access: AccessMode;
  setAccess: (a: AccessMode) => void;
  sshAllowedIps: string;
  setSshAllowedIps: (v: string) => void;
  tailscaleKey: string;
  setTailscaleKey: (v: string) => void;
}) {
  return (
    <div className="faw__step">
      <div className="faw__eyebrow">Step 3 of 3</div>
      <h1 className="faw__h">
        Where, and <em>how</em> do you reach it?
      </h1>
      <p className="faw__p">
        Datacenter location affects latency. Access mode affects how you connect.
      </p>

      <div className="faw__section-h">Region</div>
      <div className="faw__regions">
        {REGIONS.map((r) => (
          <button
            key={r.code}
            type="button"
            className={`faw__region${region === r.code ? " is-active" : ""}`}
            onClick={() => setRegion(r.code)}
            disabled={!r.available}
          >
            <div className="faw__region-flag">{r.flag}</div>
            <div className="flex-1 text-left">
              <div className="faw__region-name">{r.label}</div>
              <div className="faw__region-sub">
                {r.country} · {r.code}
              </div>
            </div>
            <div className="faw__region-ping">{r.ping}</div>
          </button>
        ))}
      </div>

      <div className="faw__section-h mt-5">
        Access mode
      </div>
      <div className="faw__access">
        {(
          [
            ["ssh", "SSH tunnel", "key", "Public port 22, allowlisted. Familiar, works everywhere."],
            [
              "tailscale_serve",
              "Tailscale Serve",
              "shield",
              "No public ports. Reachable only inside your tailnet.",
            ],
          ] as const
        ).map(([k, label, icon, desc]) => (
          <button
            key={k}
            type="button"
            className={`faw__access-card${access === k ? " is-active" : ""}`}
            onClick={() => setAccess(k)}
          >
            <div className="faw__access-ico">
              <Icon name={icon} size={16} />
            </div>
            <div className="flex-1">
              <div className="faw__access-label">{label}</div>
              <div className="faw__access-desc">{desc}</div>
            </div>
            <div className="faw__access-radio">
              {access === k ? <Icon name="check" size={14} /> : null}
            </div>
          </button>
        ))}
      </div>

      {access === "ssh" ? (
        <div className="mt-4">
          <div className="faw__section-h">Allowed IPs (CIDR, comma-separated)</div>
          <input
            className="input"
            value={sshAllowedIps}
            onChange={(e) => setSshAllowedIps(e.target.value)}
            placeholder="0.0.0.0/0"
          />
          <div className="faint text-xs mt-1.5">
            0.0.0.0/0 allows anywhere. Narrow this down if you can.
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="faw__section-h">Tailscale auth key</div>
          <input
            className="input"
            type="password"
            placeholder="tskey-auth-…"
            value={tailscaleKey}
            onChange={(e) => setTailscaleKey(e.target.value)}
          />
          <div className="faw__tip mt-2">
            <Icon name="alert" size={13} />
            <span>
              If this key is invalid or expired, provisioning will fail. You&rsquo;ll need to
              delete the assistant and create a new one with a valid key.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewCard({
  name,
  hostname,
  plan,
  region,
  access,
  step,
}: {
  name: string;
  hostname: string;
  plan: Plan | null;
  region: string;
  access: AccessMode;
  step: 0 | 1 | 2;
}) {
  const regionObj = REGIONS.find((r) => r.code === region);
  const isPlaceholder = name === "my-first-assistant";
  const hetz = plan?.providerSpec?.hetzner;

  return (
    <div className="faw__pv">
      <div className="faw__pv-label">Live preview</div>
      <div className="faw__pv-card">
        <div className="faw__pv-head">
          <div className="faw__pv-icon">
            <Icon name="bot" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`faw__pv-name${isPlaceholder ? " is-placeholder" : ""}`}>{name}</div>
            <div className="faw__pv-host">{hostname}</div>
          </div>
          <div className="pill pill--provisioning pill--dot">Preview</div>
        </div>

        <dl className="faw__pv-kv">
          <dt>Plan</dt>
          <dd>
            {step >= 1 && plan ? (
              <>
                {plan.displayName}
                <span className="faint ml-1.5">
                  {formatPrice(plan.priceCents, plan.currency)}/mo
                </span>
              </>
            ) : (
              <span className="faint">— pick in step 2</span>
            )}
          </dd>
          <dt>Server</dt>
          <dd className="mono">
            {step >= 1 && hetz?.serverType ? (
              hetz.serverType
            ) : (
              <span className="faint">—</span>
            )}
          </dd>
          <dt>Region</dt>
          <dd>
            {step >= 2 ? (
              <>
                {regionObj?.flag} {regionObj?.label}{" "}
                <span className="faint mono">({region})</span>
              </>
            ) : (
              <span className="faint">— pick in step 3</span>
            )}
          </dd>
          <dt>Access</dt>
          <dd>
            {step >= 2 ? (
              access === "ssh" ? "SSH tunnel" : "Tailscale Serve"
            ) : (
              <span className="faint">—</span>
            )}
          </dd>
        </dl>

        <div className="faw__pv-cost">
          <div>
            <div className="faw__pv-cost-k">Monthly cost</div>
            <div className="faw__pv-cost-v">
              {step >= 1 && plan ? (
                `${formatPrice(plan.priceCents, plan.currency)}/mo`
              ) : (
                <span className="faint">—</span>
              )}
            </div>
          </div>
          <div className="faw__pv-cost-split" />
          <div>
            <div className="faw__pv-cost-k">Credits used</div>
            <div className="faw__pv-cost-v">1 / 1</div>
          </div>
        </div>

        {step >= 2 ? (
          <div className="faw__pv-term">
            <div className="faw__pv-term-prompt">
              {access === "ssh" ? (
                <>
                  <span className="text-primary">$</span> ssh root@
                  <span className="faw__pv-term-host">{hostname}</span>
                </>
              ) : (
                <>
                  <span className="text-primary">→</span> https://
                  <span className="faw__pv-term-host">{name}.tail-scale.ts.net</span>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="faw__pv-trust">
        <Icon name="shield" size={13} />
        We don&rsquo;t store your SSH key or messages. You download the private key once.
      </div>
    </div>
  );
}

function NeedCreditModal({
  plan,
  orgId: _orgId,
  onClose,
  onNavigate,
}: {
  plan: Plan;
  orgId: string;
  onClose: () => void;
  onNavigate: () => void;
}): ReactNode {
  return (
    <>
      <div className="cmdk-scrim" onClick={onClose} />
      <div className="modal w-[460px] p-7" role="dialog" aria-modal>
        <div className="w-11 h-11 mx-auto mb-[14px] rounded-full bg-primary/15 text-primary grid place-items-center">
          <Icon name="creditCard" size={22} />
        </div>
        <div className="text-center text-xl font-medium mb-1.5 font-[var(--font-instrument-serif)]">
          You don&rsquo;t have a credit for this plan
        </div>
        <div className="faint text-center text-[13px] mb-5 leading-[1.55]">
          You picked <b>{plan.displayName}</b> ({formatPrice(plan.priceCents, plan.currency)}/mo),
          but no active credit is available for it. Head to Pricing to activate a subscription —
          your assistant will deploy as soon as the credit arrives.
        </div>

        <div className="flex justify-between items-center bg-muted border border-border rounded-[10px] px-[14px] py-3 mb-5 text-[13px]">
          <div>
            <div className="font-semibold">
              {plan.displayName}{" "}
              <span className="faint font-normal">
                credit
              </span>
            </div>
            <div className="faint text-[11px] mt-0.5">
              {plan.tagline ?? "monthly subscription"}
            </div>
          </div>
          <div className="text-right">
            <div className="mono font-semibold">
              {formatPrice(plan.priceCents, plan.currency)}
              <span className="faint font-normal">
                /mo
              </span>
            </div>
            <div className="faint text-[11px] mt-0.5">
              Billed monthly · cancel anytime
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn--ghost flex-1 justify-center"
            onClick={onClose}
          >
            Cancel
          </button>
          <Link
            href={`/dashboard/${_orgId}/pricing`}
            onClick={onNavigate}
            className="btn btn--primary flex-[2] justify-center"
          >
            <Icon name="tag" size={14} />
            Go to pricing
          </Link>
        </div>
      </div>
    </>
  );
}

// Ordered provisioning steps shown in the deploy rail. Cloud-init + OpenClaw
// install are the slow ones (~1-2 min combined), so we advance the UI step
// based on elapsed time while polling the real assistant status for the
// terminal transition (active / error).
const DEPLOY_STEPS = [
  { label: "Reserving credit", atSec: 0 },
  { label: "Creating Hetzner server", atSec: 6 },
  { label: "Applying firewall rules", atSec: 18 },
  { label: "Waiting for cloud-init", atSec: 30 },
  { label: "Installing OpenClaw runtime", atSec: 80 },
  { label: "Registering gateway", atSec: 130 },
  { label: "Handing you the keys", atSec: 160 },
] as const;

type DeployState = "pending" | "ready" | "error";

function DeployingScene({
  name,
  hostname,
  plan,
  region,
  assistantId,
  onBackToList,
  onCancel,
  onOpenAssistant,
}: {
  name: string;
  hostname: string;
  plan: Plan;
  region: string;
  assistantId: string | null;
  onBackToList: () => void;
  onCancel: () => void;
  onOpenAssistant: () => void;
}) {
  const rpc = useRpc();
  const [elapsed, setElapsed] = useState(0);
  const [state, setState] = useState<DeployState>("pending");
  const [errorMsg, setErrorMsg] = useState("");
  const [log, setLog] = useState<string[]>([]);

  // Elapsed-seconds ticker — drives the visible step progression.
   
  useEffect(() => {
    if (state !== "pending") return;
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 500);
    return () => clearInterval(id);
  }, [state]);
   

  // Poll the real assistant until we see a terminal status. 4s is a good
  // trade between timeliness and Hetzner rate limits.
  const poll = useCallback(async () => {
    if (!assistantId) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.assistants as any)[":id"].$get({ param: { id: assistantId } });
      if (!res.ok) return;
      const data = (await res.json()) as { status: string; lastErrorAt: string | null };
      if (data.status === "active") setState("ready");
      else if (data.status === "error") {
        setState("error");
        setErrorMsg(data.lastErrorAt ? `Failed at ${new Date(data.lastErrorAt).toLocaleString()}` : "Provisioning failed.");
      }
    } catch {
      /* transient — next tick retries */
    }
  }, [assistantId, rpc]);

  // Status poll — the only way to know when provisioning completes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!assistantId || state !== "pending") return;
    void poll();
    const id = setInterval(() => void poll(), 4000);
    return () => clearInterval(id);
  }, [assistantId, state, poll]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Append a terminal line whenever the derived "current step" advances.
  const cur = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < DEPLOY_STEPS.length; i++) {
      if (elapsed >= DEPLOY_STEPS[i].atSec) idx = i;
    }
    return state === "ready" ? DEPLOY_STEPS.length : idx;
  }, [elapsed, state]);

  const lastLoggedCur = useRef(-1);
  useEffect(() => {
    if (cur === lastLoggedCur.current) return;
    const step = DEPLOY_STEPS[Math.min(cur, DEPLOY_STEPS.length - 1)];
    if (!step) return;
    lastLoggedCur.current = cur;
    const line = `[${new Date().toISOString().slice(11, 19)}] ${step.label}…`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLog((l) => [...l, line]);
  }, [cur]);

  const pct =
    state === "ready"
      ? 100
      : state === "error"
        ? Math.round((cur / DEPLOY_STEPS.length) * 100)
        : Math.min(95, Math.round((cur / DEPLOY_STEPS.length) * 100));

  const heading =
    state === "ready" ? (
      <>
        Your assistant is <em>live</em>.
      </>
    ) : state === "error" ? (
      <>
        Something went <em>wrong</em>.
      </>
    ) : (
      <>
        Spinning up <em>{name}</em>…
      </>
    );

  const eyebrow =
    state === "ready" ? "Ready" : state === "error" ? "Failed" : "Provisioning";

  return (
    <div className="faw faw--deploy">
      <div className="faw__bg" aria-hidden />
      <div className="deploy">
        <div className="deploy__left">
          <div className="deploy__eyebrow">{eyebrow}</div>
          <h1 className="deploy__h">{heading}</h1>
          <div className="deploy__host">{hostname}</div>

          <div className="deploy__progress">
            <div className="deploy__progress-bar" style={{ width: `${pct}%` }} />
          </div>

          <ol className="deploy__steps">
            {DEPLOY_STEPS.map((s, i) => {
              const stepState: "done" | "current" | "pending" | "error" =
                state === "error" && i === cur
                  ? "error"
                  : i < cur
                    ? "done"
                    : i === cur && state === "pending"
                      ? "current"
                      : i < DEPLOY_STEPS.length && state === "ready"
                        ? "done"
                        : "pending";
              return (
                <li key={s.label} className={`deploy__step is-${stepState}`}>
                  <span className="deploy__step-dot">
                    {stepState === "done" ? (
                      <Icon name="check" size={11} />
                    ) : stepState === "current" ? (
                      <span className="deploy__spin" />
                    ) : stepState === "error" ? (
                      <Icon name="x" size={11} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="deploy__step-label">{s.label}</span>
                  {stepState === "current" ? <span className="deploy__step-t">…</span> : null}
                </li>
              );
            })}
          </ol>

          {state === "pending" ? (
            <div className="faint mt-[14px] text-xs leading-[1.5] max-w-[380px]">
              This usually takes 2&ndash;3 minutes. You can wait here, or head back and we&rsquo;ll
              surface it in the notifications bell when your assistant is ready.
            </div>
          ) : null}

          <div className="mt-5 flex gap-2 flex-wrap">
            {state === "ready" ? (
              <button type="button" className="fa-hero__primary" onClick={onOpenAssistant}>
                <Icon name="arrowRight" size={14} />
                Open assistant
              </button>
            ) : state === "error" ? (
              <>
                <button type="button" className="btn btn--primary" onClick={onOpenAssistant}>
                  <Icon name="activity" size={14} />
                  View details
                </button>
                <button type="button" className="btn btn--ghost" onClick={onBackToList}>
                  Back to dashboard
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn--ghost" onClick={onBackToList}>
                  <Icon name="bell" size={14} />
                  Notify me when ready
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
                  Back to form
                </button>
              </>
            )}
          </div>

          {errorMsg ? (
            <div className="field__err mt-3 max-w-[440px]">
              {errorMsg}
            </div>
          ) : null}
        </div>

        <div className="deploy__right">
          <div className="deploy__term">
            <div className="deploy__term-bar">
              <span className="fa-hero__dot3" style={{ background: "#ff5f57" }} />
              <span className="fa-hero__dot3" style={{ background: "#febc2e" }} />
              <span className="fa-hero__dot3" style={{ background: "#28c840" }} />
              <div className="deploy__term-title">
                clawbot deploy · {region} · {plan.displayName}
              </div>
            </div>
            <div className="deploy__term-body">
              {log.map((line, i) => (
                <div key={i} className="deploy__term-line">
                  {line}
                </div>
              ))}
              {state === "pending" ? (
                <div className="deploy__term-line">
                  <span className="fa-hero__caret" />
                </div>
              ) : state === "ready" ? (
                <div className="deploy__term-line text-[var(--success)]">
                  [ok] assistant online · gateway reachable
                </div>
              ) : (
                <div className="deploy__term-line text-destructive">
                  [err] provisioning failed — open the detail page for logs
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
