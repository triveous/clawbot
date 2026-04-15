# Phase 6 — Marketing + Onboarding

Reference: [Phase 6 Docs](../docs/phase-6-marketing.md)

## Landing Page

- [ ] Hero section (headline, subtext, CTA, animated background)
- [ ] Features grid (3 columns)
- [ ] How It Works (3-step)
- [ ] Tech stack badges section
- [ ] Pricing table (shared component)
- [ ] Final CTA section
- [ ] Magic UI animations (AnimatedBeam, BentoGrid, NumberTicker, ShimmerButton)

## Pricing

- [ ] Build pricing page using shared `PricingTable` component
- [ ] Wire Stripe Checkout CTAs (authenticated flow)
- [ ] FAQ accordion

## Onboarding Polish

- [ ] Remove `channels` step from `src/app/(auth)/onboarding/`
- [ ] Rename flow: name → plan → deploy
- [ ] Wire "plan" step to Stripe Checkout (uses Phase 5 endpoints)
- [ ] Polish copy and progress animations

## SEO

- [ ] `src/app/(marketing)/layout.tsx` metadata (title, description, OG, Twitter)
- [ ] OG image at `public/og-image.png` (1200×630)
- [ ] `src/app/sitemap.ts` and `src/app/robots.ts`

## Testing

- [ ] Component tests for marketing components
- [ ] E2E: landing → signup → onboarding → deploy
- [ ] Lighthouse SEO ≥ 90
- [ ] Verify OG tags render on Twitter/FB debuggers
