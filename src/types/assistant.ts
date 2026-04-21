export type AssistantStatus = "creating" | "active" | "error" | "stopped";

export type Provider = "hetzner";

export type AccessMode = "ssh" | "tailscale_serve";

export interface AssistantResponse {
  id: string;
  name: string;
  status: AssistantStatus;
  provider: Provider;
  planId: string;
  ipv4: string | null;
  hostname: string | null;
  region: string;
  accessMode: AccessMode;
  gatewayPort: number | null;
  instanceId: string | null;
  lastErrorAt: string | null;
  sshAllowedIps: string | null;
  createdAt: string;
}

export interface CreateAssistantRequest {
  name: string;
  planId: string;
  region?: string;
  accessMode?: AccessMode;
  sshAllowedIps?: string;
  tailscaleAuthKey?: string;
}
