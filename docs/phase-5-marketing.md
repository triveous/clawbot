# Phase 5: Marketing

## Goal

Build the public-facing marketing pages, pricing page with Stripe Checkout integration, and the post-signup onboarding wizard. Visual style: Linear-like with Magic UI animations.

## Landing Page

**Route:** `src/app/(marketing)/page.tsx`

### Sections

1. **Hero** -- Headline, subtext, CTA button ("Get Started"), animated background (Magic UI)
2. **Features** -- 3-column grid: one-click deploy, multi-channel, usage-based billing
3. **How It Works** -- 3-step flow: create agent, connect channels, go live
4. **Channels** -- Visual grid of supported channels with logos
5. **Pricing** -- Embedded pricing table (shared with pricing page)
6. **CTA** -- Final call to action with sign-up link

### Components

```
src/components/marketing/
  Hero.tsx
  Features.tsx
  HowItWorks.tsx
  ChannelGrid.tsx
  PricingTable.tsx       -- Shared with pricing page
  CallToAction.tsx
```

### Magic UI Animations

- `AnimatedBeam` for the hero background
- `BentoGrid` for features section
- `MarqueeDemo` for channel logos
- `NumberTicker` for stats (agents deployed, messages processed)
- Smooth scroll-triggered fade-ins throughout

## Pricing Page

**Route:** `src/app/(marketing)/pricing/page.tsx`

- Uses shared `PricingTable` component
- Each plan card shows: name, price, features list, CTA button
- CTA button links to Stripe Checkout (authenticated) or sign-up (unauthenticated)
- Toggle for monthly/annual billing (future)
- FAQ accordion below pricing cards

## Onboarding Wizard

**Route:** `src/app/(auth)/onboarding/page.tsx`

Triggered after first sign-up. Multi-step wizard:

```
Step 1: Name your agent
  - Text input for agent name
  - Region selection (optional, defaults to nearest)

Step 2: Choose channels
  - Channel selection cards (Telegram, WhatsApp, Discord, Slack, Web)
  - Multiple selection allowed
  - Brief description of each

Step 3: Choose plan
  - Pricing cards (Starter, Pro, Power)
  - Redirects to Stripe Checkout

Step 4: Deploy
  - Triggers provisioning workflow
  - Shows progress animation while deploying
  - Redirects to dashboard when complete
```

### Components

```
src/components/onboarding/
  OnboardingWizard.tsx
  StepNameAgent.tsx
  StepSelectChannels.tsx
  StepSelectPlan.tsx
  StepDeploy.tsx
  ProgressIndicator.tsx
```

## SEO and Metadata

### `src/app/(marketing)/layout.tsx`

```ts
export const metadata: Metadata = {
  title: "SnapClaw - Managed OpenClaw Hosting",
  description: "Deploy AI agents in minutes. Multi-channel support...",
  openGraph: {
    title: "SnapClaw",
    description: "...",
    images: ["/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SnapClaw",
    description: "...",
    images: ["/og-image.png"],
  },
};
```

- OG image at `public/og-image.png` (1200x630)
- Per-page metadata overrides for pricing, etc.
- Sitemap at `src/app/sitemap.ts`
- Robots at `src/app/robots.ts`

## Files Owned

```
src/app/(marketing)/page.tsx
src/app/(marketing)/pricing/page.tsx
src/app/(marketing)/layout.tsx
src/app/(auth)/onboarding/page.tsx
src/components/marketing/Hero.tsx
src/components/marketing/Features.tsx
src/components/marketing/HowItWorks.tsx
src/components/marketing/ChannelGrid.tsx
src/components/marketing/PricingTable.tsx
src/components/marketing/CallToAction.tsx
src/components/onboarding/OnboardingWizard.tsx
src/components/onboarding/StepNameAgent.tsx
src/components/onboarding/StepSelectChannels.tsx
src/components/onboarding/StepSelectPlan.tsx
src/components/onboarding/StepDeploy.tsx
src/components/onboarding/ProgressIndicator.tsx
src/app/sitemap.ts
src/app/robots.ts
public/og-image.png
```

## Definition of Done

- Landing page loads with all sections and Magic UI animations
- Pricing page renders 3 plans with working Stripe Checkout links
- Onboarding wizard completes full flow: name -> channels -> plan -> deploy
- Lighthouse SEO score >= 90
- OG tags render correctly when shared on social platforms
