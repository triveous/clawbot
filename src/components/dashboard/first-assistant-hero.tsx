"use client";

import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@/hooks/use-rpc";
import { Icon } from "./icon";
import { ClawSigil } from "./claw-sigil";

type CreditSummary = { available: number; planLabel: string | null };

export function FirstAssistantHero({
  orgName,
  onStart,
  paused,
}: {
  orgName: string;
  onStart: () => void;
  paused?: boolean;
}) {
  const rpc = useRpc();
  const [credits, setCredits] = useState<CreditSummary>({ available: 0, planLabel: null });

  const loadCredits = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([rpc.api.credits.$get(), rpc.api.plans.$get()]);
      if (!cRes.ok || !pRes.ok) return;
      const c = (await cRes.json()) as {
        credits: { planId: string; status: string; consumedByAssistantId: string | null; currentPeriodEnd: string | null }[];
      };
      const p = (await pRes.json()) as { plans: { id: string; displayName: string }[] };
      const now = Date.now();
      const avail = c.credits.filter(
        (x) =>
          x.status === "active" &&
          !x.consumedByAssistantId &&
          x.currentPeriodEnd &&
          new Date(x.currentPeriodEnd).getTime() > now,
      );
      const firstPlan = avail[0] ? p.plans.find((pl) => pl.id === avail[0].planId) : null;
      setCredits({ available: avail.length, planLabel: firstPlan?.displayName ?? null });
    } catch {
      /* stay on defaults */
    }
  }, [rpc]);

  useEffect(() => {
    // One-shot credit summary fetch for the hero chip — swap to SWR if this
    // page starts needing revalidation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCredits();
  }, [loadCredits]);

  return (
    <div className="fa-hero">
      <div className="fa-hero__bg" aria-hidden>
        <div className="fa-hero__glow" />
        <div className="fa-hero__grid" />
      </div>

      <div className="fa-hero__inner">
        <div className="fa-hero__copy">
          <div className="fa-hero__eyebrow">
            <span className="fa-hero__dot" />
            New workspace · {orgName}
          </div>
          <h1 className="fa-hero__title">
            <span className="fa-hero__title-line">Your first</span>
            <span className="fa-hero__title-line fa-hero__title-accent">
              <em>assistant</em> is one click away.
            </span>
          </h1>
          <p className="fa-hero__sub">
            We&rsquo;ll spin up a hardened VPS, install OpenClaw, and hand you the keys.{" "}
            <span className="dim">Usually live in about 3 minutes.</span>
          </p>

          <div className="fa-hero__cta">
            <button type="button" className="fa-hero__primary" onClick={onStart}>
              <span className="fa-hero__primary-spark" />
              <Icon name="zap" size={15} />
              Create your first assistant
              <span className="fa-hero__kbd">C</span>
            </button>
          </div>

          <ul className="fa-hero__trust">
            {[
              { icon: "lock", h: "Your keys, your box", s: "We don't store your messages." },
              { icon: "zap", h: "Live in ~3 minutes", s: "VPS + OpenClaw + gateway, ready." },
              { icon: "gitBranch", h: "One-click rollback", s: "Snapshots before every change." },
            ].map((t) => (
              <li key={t.h}>
                <span className="fa-hero__trust-ico">
                  <Icon name={t.icon as "lock" | "zap" | "gitBranch"} size={14} />
                </span>
                <div>
                  <div className="fa-hero__trust-h">{t.h}</div>
                  <div className="fa-hero__trust-s">{t.s}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="fa-hero__art">
          <div className="fa-hero__frame">
            <div className="fa-hero__bar">
              <span className="fa-hero__dot3" style={{ background: "#ff5f57" }} />
              <span className="fa-hero__dot3" style={{ background: "#febc2e" }} />
              <span className="fa-hero__dot3" style={{ background: "#28c840" }} />
              <div className="fa-hero__bar-title">preview / first-assistant.clawbot.dev</div>
            </div>
            <div className="fa-hero__body">
              <ClawSigil paused={paused} />
              <div className="fa-hero__console">
                <div className="fa-hero__line">
                  <span className="fa-hero__prompt">$</span> clawbot create
                </div>
                <div className="fa-hero__line fa-hero__line--muted">Ready. Waiting for you.</div>
                <div className="fa-hero__line">
                  <span className="fa-hero__caret" />
                </div>
              </div>
            </div>
          </div>

          <div className="fa-hero__chip fa-hero__chip--count">
            <div className="fa-hero__chip-num">0</div>
            <div>
              <div className="fa-hero__chip-h">assistants</div>
              <div className="fa-hero__chip-s">nothing running yet</div>
            </div>
          </div>
          <div className="fa-hero__chip fa-hero__chip--credit">
            <span className="fa-hero__chip-ico">
              <Icon name="coins" size={13} />
            </span>
            <div>
              <div className="fa-hero__chip-h">
                {credits.available > 0
                  ? `${credits.available} credit${credits.available > 1 ? "s" : ""} ready`
                  : "No credits yet"}
              </div>
              <div className="fa-hero__chip-s">
                {credits.planLabel ? `${credits.planLabel} · ready to use` : "Buy a plan to start"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
