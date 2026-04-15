# Phase 6: Marketing + Onboarding

## Goal

Public-facing marketing pages, pricing page with Stripe Checkout integration, and post-signup onboarding polish. Visual style: Linear-like with Magic UI animations. Deferred from the original Phase 5 ordering — Dashboard and Billing ship first so marketing has a real, monetized product to point at.

Clawhost has no marketing pages worth copying — this is a write-from-scratch phase.

## Landing Page

**Route:** `src/app/(marketing)/page.tsx`

### Sections

1. **Hero** — headline, subtext, CTA ("Get Started"), animated background
2. **Features** — 3-column grid: one-click deploy, hardened provisioning, full terminal + file access
3. **How It Works** — 3-step: sign up → pick plan → get a running OpenClaw on your own VPS
4. **Tech stack badges** — "Your own Hetzner VPS", "Cloudflare DNS", "OpenClaw {version}"
5. **Pricing** — embedded pricing table (shared with pricing page)
6. **CTA** — final call to action

### Components

```
src/components/marketing/
  Hero.tsx
  Features.tsx
  HowItWorks.tsx
  PricingTable.tsx       # shared with pricing page
  CallToAction.tsx
```

### Magic UI

- `AnimatedBeam` for hero background
- `BentoGrid` for features
- `NumberTicker` for stats
- `ShimmerButton` for primary CTAs
- Scroll-triggered fade-ins

## Pricing Page

**Route:** `src/app/(marketing)/pricing/page.tsx`

- Shared `PricingTable` component
- Each plan card: name, price, features, CTA button
- CTA links to Stripe Checkout (authenticated) or sign-up (unauthenticated)
- FAQ accordion below

## Onboarding Flow

The 3-step onboarding already exists under `src/app/(auth)/onboarding/` (name → channels → deploy). Phase 6 **polishes**, doesn't rewrite:

- Remove the "channels" step (channel setup is deferred post-MVP — users SSH in directly)
- Rename to: name → plan → deploy
- Wire the "plan" step to Stripe Checkout (uses Phase 5's endpoints)
- Polish copy, add progress animation on deploy step

## SEO and Metadata

### `src/app/(marketing)/layout.tsx`

```ts
export const metadata: Metadata = {
  title: "SnapClaw — Managed OpenClaw Hosting",
  description:
    "Deploy your personal OpenClaw agent on your own VPS in minutes.",
  openGraph: {
    /* ... */
  },
  twitter: { card: "summary_large_image" /* ... */ },
};
```

- OG image at `public/og-image.png` (1200×630)
- `src/app/sitemap.ts`, `src/app/robots.ts`

## Files Owned

```
src/app/(marketing)/page.tsx
src/app/(marketing)/pricing/page.tsx
src/app/(marketing)/layout.tsx
src/app/(auth)/onboarding/**          # polish existing
src/components/marketing/Hero.tsx
src/components/marketing/Features.tsx
src/components/marketing/HowItWorks.tsx
src/components/marketing/PricingTable.tsx
src/components/marketing/CallToAction.tsx
src/app/sitemap.ts
src/app/robots.ts
public/og-image.png
```

## Definition of Done

- Landing page loads with all sections, Magic UI animations smooth
- Pricing page renders 3 plans with working Stripe Checkout links (uses Phase 5)
- Onboarding: name → plan → deploy completes end-to-end; channels step removed
- Lighthouse SEO score ≥ 90
- OG tags render correctly on social platforms (verify with Twitter/FB debuggers)
