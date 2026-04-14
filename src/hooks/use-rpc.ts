"use client";

import { useMemo } from "react";
import { createApiClient } from "@/server/rpc";

export function useRpc() {
  const client = useMemo(() => createApiClient(), []);
  return client;
}
