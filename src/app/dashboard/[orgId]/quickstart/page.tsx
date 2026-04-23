"use client";

import { use } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard";

export default function QuickstartPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);

  const steps: {
    num: string;
    title: string;
    desc: string;
    accent?: boolean;
    cta?: { label: string; href: string; primary?: boolean };
  }[] = [
    {
      num: "01",
      title: "Pick a plan and buy a credit",
      desc: "Starter is $25/mo. You can cancel anytime; the first credit gets an auto-applied 7-day trial.",
      accent: true,
      cta: { label: "See pricing", href: `/dashboard/${orgId}/pricing`, primary: true },
    },
    {
      num: "02",
      title: "Attach the credit to an assistant",
      desc: "Choose a name, a region, and whether you want SSH or Tailscale access. We handle the rest.",
      cta: { label: "Create assistant", href: `/dashboard/${orgId}?create=1` },
    },
    {
      num: "03",
      title: "Open the gateway and point OpenClaw at it",
      desc: "Copy the SSH tunnel command (or open via Tailscale) and you're in. Your keys, your box.",
    },
  ];

  return (
    <div className="mx-auto my-10 max-w-[760px]">
      <div className="mb-9 text-center">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-[14px] bg-primary text-white">
          <Icon name="bot" size={28} />
        </div>
        <h1 className="mb-2 font-[var(--font-instrument-serif)] text-[40px] font-normal leading-[1.1] tracking-[-0.02em]">
          Welcome to <span className="text-primary">Clawbot</span>
        </h1>
        <p className="mx-auto max-w-[520px] text-[15px] leading-[1.55] text-muted-foreground">
          Three steps. Five minutes. Then your agent is live on its own hardened VPS — no
          Docker, no pasted API keys, no middleman.
        </p>
      </div>

      <div className="flex flex-col gap-3.5">
        {steps.map((s) => (
          <div
            key={s.num}
            className={`flex gap-[18px] rounded-xl border px-[22px] py-5 ${
              s.accent
                ? "border-primary/30 bg-primary/15"
                : "border-border bg-card"
            }`}
          >
            <div
              className={`w-[60px] shrink-0 font-[var(--font-instrument-serif)] text-[40px] leading-none ${
                s.accent ? "text-primary" : "text-muted-foreground/70"
              }`}
            >
              {s.num}
            </div>
            <div className="flex-1">
              <div className="mb-1 text-base font-semibold">{s.title}</div>
              <div className="dim text-[13px] leading-[1.55]">{s.desc}</div>
            </div>
            {s.cta ? (
              <div className="self-center">
                <Link
                  href={s.cta.href}
                  className={`btn ${s.cta.primary ? "btn--primary" : "btn--ghost"}`}
                >
                  {s.cta.primary ? <Icon name="zap" size={14} /> : null}
                  {s.cta.label}
                </Link>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
