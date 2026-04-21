// Feature flags — controlled by NEXT_PUBLIC_FF_* env vars.
// Safe to import from both server and client code.

export const flags = {
  /** Show org switcher, Members nav link, and org-scoped UI. */
  orgs: process.env.NEXT_PUBLIC_FF_ORGS === "true",
} as const;
