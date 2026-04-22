"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRpc } from "@/hooks/use-rpc";
import {
  SectionCard,
  Icon,
  CodeBlock,
  Callout,
  type IconName,
} from "@/components/dashboard";

type AssistantStatus = "creating" | "active" | "error" | "stopped";
type Assistant = { id: string; name: string; status: AssistantStatus; hostname: string | null };
type Credit = {
  planId: string;
  status: string;
  consumedByAssistantId: string | null;
  currentPeriodEnd: string | null;
};

export default function QuickstartPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const rpc = useRpc();

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [aRes, cRes] = await Promise.all([
        rpc.api.assistants.$get(),
        rpc.api.credits.$get(),
      ]);
      if (aRes.ok) {
        const d = (await aRes.json()) as { assistants: Assistant[] };
        setAssistants(d.assistants);
      }
      if (cRes.ok) {
        const d = (await cRes.json()) as { credits: Credit[] };
        setCredits(d.credits);
      }
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  const availableCredit = credits.some(
    (c) =>
      c.status === "active" &&
      !c.consumedByAssistantId &&
      c.currentPeriodEnd &&
      new Date(c.currentPeriodEnd).getTime() > now,
  );
  const hasAssistant = assistants.length > 0;
  const hasRunning = assistants.some((a) => a.status === "active");
  const firstRunning = assistants.find((a) => a.status === "active");

  const steps: {
    state: "done" | "current" | "pending";
    icon: IconName;
    title: string;
    body: React.ReactNode;
  }[] = [
    {
      state: availableCredit || hasAssistant ? "done" : "current",
      icon: "tag",
      title: "Pick a plan",
      body: availableCredit || hasAssistant ? (
        <div className="faint">You have a credit ready.</div>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            Subscriptions = credits. One credit runs one assistant.
          </div>
          <Link href={`/dashboard/${orgId}/pricing`} className="btn btn--primary btn--sm">
            <Icon name="zap" size={12} />
            See pricing
          </Link>
        </>
      ),
    },
    {
      state: hasAssistant
        ? hasRunning
          ? "done"
          : "current"
        : availableCredit
          ? "current"
          : "pending",
      icon: "bot",
      title: "Deploy your first assistant",
      body: hasAssistant ? (
        hasRunning ? (
          <div className="faint">
            {firstRunning ? (
              <>
                Running as <span className="mono">{firstRunning.hostname ?? firstRunning.name}</span>.
              </>
            ) : (
              "At least one assistant is live."
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              Your assistant is provisioning. It usually takes 2&ndash;3 minutes.
            </div>
            <Link href={`/dashboard/${orgId}`} className="btn btn--ghost btn--sm">
              <Icon name="activity" size={12} />
              Watch progress
            </Link>
          </>
        )
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            Open the assistants page and click <b>New assistant</b> (or take the immersive wizard
            from the empty state).
          </div>
          <Link href={`/dashboard/${orgId}`} className="btn btn--primary btn--sm">
            <Icon name="plus" size={12} />
            Go to assistants
          </Link>
        </>
      ),
    },
    {
      state: hasRunning ? "current" : "pending",
      icon: "terminal",
      title: "Connect from your terminal",
      body: (
        <>
          <div style={{ marginBottom: 10 }}>
            Tunnel into your gateway with the SSH key you downloaded. Replace{" "}
            <span className="mono">&lt;name&gt;</span> with your assistant&rsquo;s name.
          </div>
          <CodeBlock code="chmod 400 <name>.pem" />
          <div style={{ height: 8 }} />
          <CodeBlock code="ssh -i <name>.pem -N -L 8888:localhost:8443 root@<ip>" />
          <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
            Then open <span className="mono">http://localhost:8888</span>.
          </div>
        </>
      ),
    },
    {
      state: hasRunning ? "pending" : "pending",
      icon: "send",
      title: "Call it from the SDK",
      body: (
        <>
          <div style={{ marginBottom: 10 }}>
            Use your gateway token (reveal it on the assistant&rsquo;s Connect tab) with the
            OpenClaw SDK.
          </div>
          <CodeBlock
            prompt="#"
            code={`from openclaw import Claw

claw = Claw(
    gateway="http://localhost:8888",
    token=$GATEWAY_TOKEN,
)

reply = claw.chat("Hello, Claw!")
print(reply)`}
          />
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Quickstart{" "}
            <span className="accent" style={{ fontFamily: "var(--font-instrument-serif)" }}>
              in 4 steps
            </span>
          </h1>
          <div className="page__sub">
            From empty workspace to running assistant. Usually takes under 5 minutes.
          </div>
        </div>
        <div className="page__actions">
          <Link href={`/dashboard/${orgId}/docs`} className="btn btn--ghost">
            <Icon name="bookOpen" size={14} />
            Full docs
          </Link>
        </div>
      </div>

      {loading ? null : (
        <div className="col" style={{ gap: 16 }}>
          {!availableCredit && !hasAssistant ? (
            <Callout kind="info" icon="info" title="You don't have any credits yet">
              The first step below walks you through buying one.
            </Callout>
          ) : null}

          {steps.map((s) => (
            <SectionCard key={s.title}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    background:
                      s.state === "done"
                        ? "color-mix(in oklab, var(--success) 16%, transparent)"
                        : s.state === "current"
                          ? "var(--db-red-dim)"
                          : "var(--db-surface-2)",
                    color:
                      s.state === "done"
                        ? "var(--success)"
                        : s.state === "current"
                          ? "var(--db-red)"
                          : "var(--db-text-faint)",
                  }}
                >
                  <Icon name={s.state === "done" ? "check" : s.icon} size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      marginBottom: 8,
                      color:
                        s.state === "pending" ? "var(--muted-foreground)" : "var(--foreground)",
                    }}
                  >
                    {s.title}
                    {s.state === "done" ? (
                      <span className="pill pill--active" style={{ marginLeft: 10 }}>
                        Done
                      </span>
                    ) : s.state === "current" ? (
                      <span className="pill pill--info" style={{ marginLeft: 10 }}>
                        Next
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>{s.body}</div>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
