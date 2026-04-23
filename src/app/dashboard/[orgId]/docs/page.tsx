"use client";

import { use } from "react";
import Link from "next/link";
import { SectionCard, Icon, type IconName } from "@/components/dashboard";

type DocCard = {
  slug: string;
  icon: IconName;
  title: string;
  description: string;
  readTime: string;
  href: string;
};

const DOCS: DocCard[] = [
  {
    slug: "quickstart",
    icon: "zap",
    title: "Quickstart",
    description: "Your first assistant in under 5 minutes — subscribe, deploy, connect.",
    readTime: "3 min",
    href: "#quickstart",
  },
  {
    slug: "access-modes",
    icon: "key",
    title: "Access modes",
    description: "SSH tunnel vs Tailscale Serve — when to pick each, and how to rotate.",
    readTime: "4 min",
    href: "#access-modes",
  },
  {
    slug: "cli",
    icon: "terminal",
    title: "CLI reference",
    description: "Every `clawbot` command with examples, flags, and exit codes.",
    readTime: "6 min",
    href: "#cli",
  },
  {
    slug: "sdk",
    icon: "pkg",
    title: "OpenClaw SDK",
    description: "Python and TypeScript clients for talking to your gateway.",
    readTime: "5 min",
    href: "#sdk",
  },
  {
    slug: "security",
    icon: "shield",
    title: "Security",
    description: "How keys are stored, what we never touch, and our disclosure policy.",
    readTime: "4 min",
    href: "#security",
  },
  {
    slug: "versions",
    icon: "gitBranch",
    title: "Versions",
    description: "Pin, roll back, and promote OpenClaw versions across environments.",
    readTime: "3 min",
    href: "#versions",
  },
];

export default function DocsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);

  return (
    <div>
      <div className="page__head">
        <div>
          <h1 className="page__title">
            Docs{" "}
            <span className="accent" style={{ fontFamily: "var(--font-instrument-serif)" }}>
              &amp; references
            </span>
          </h1>
          <div className="page__sub">
            Everything you need to ship with Clawbot. In-dashboard rendering lands in the next
            release; the cards below point to the source files in the handoff bundle for now.
          </div>
        </div>
        <div className="page__actions">
          <Link href={`/dashboard/${orgId}/quickstart`} className="btn btn--primary">
            <Icon name="zap" size={14} />
            Quickstart
          </Link>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          marginBottom: 24,
        }}
      >
        {DOCS.map((d) => (
          <SectionCard key={d.slug} className="docs-card">
            <div className="docs-card__icon">
              <Icon name={d.icon} size={18} />
            </div>
            <div className="docs-card__title">{d.title}</div>
            <div className="docs-card__desc">{d.description}</div>
            <div className="docs-card__foot">
              <span>{d.readTime} read</span>
              <span className="docs-card__arrow">
                <Icon name="arrowRight" size={14} />
              </span>
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard
        title="Help &amp; support"
        sub="Can't find what you need? Here's where to go next."
      >
        <div className="col" style={{ gap: 12, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Icon name="mail" size={14} />
            <div>
              Email us at <span className="mono">support@clawbot.dev</span> — replies within one
              business day.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Icon name="shield" size={14} />
            <div>
              Security issues: <span className="mono">security@clawbot.dev</span> (PGP key on the
              Security doc).
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Icon name="gitBranch" size={14} />
            <div>
              OpenClaw source, issues, and roadmap on GitHub (linked from the Versions doc).
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
