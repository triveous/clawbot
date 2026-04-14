import { hc } from "hono/client";
import type { AppType } from "./index";

export function createApiClient(baseUrl?: string) {
  return hc<AppType>(baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "");
}

export type ApiClient = ReturnType<typeof createApiClient>;
