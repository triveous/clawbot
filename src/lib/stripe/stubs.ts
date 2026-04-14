/**
 * Cross-phase stubs for billing functions.
 * Phase 4 will replace these with real Stripe implementations.
 */

/**
 * Check if a user is allowed to provision a new agent.
 * Stub: always returns true until Phase 4 implements Stripe checks.
 */
export async function canProvision(_userId: string): Promise<boolean> {
  // TODO: Phase 4 — check active Stripe subscription + plan agent limits
  return true;
}
