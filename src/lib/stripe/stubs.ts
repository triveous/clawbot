// Re-export shim — real implementation in src/lib/billing/credits.ts
// Phase 5 will wire Stripe checkout to mint credits; this file can be
// deleted once all import sites point directly to billing/credits.
export { canProvision } from "@/lib/billing/credits";
