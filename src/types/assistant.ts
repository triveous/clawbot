export type AssistantStatus =
  | "creating"
  | "provisioning"
  | "running"
  | "stopped"
  | "error";

export type Provider = "hetzner";

export type AccessMode = "ssh" | "tailscale_serve";

export interface AssistantResponse {
  id: string;
  name: string;
  status: AssistantStatus;
  provider: Provider;
  ipv4: string | null;
  hostname: string | null;
  region: string;
  accessMode: AccessMode;
  gatewayPort: number | null;
  createdAt: string;
}

export interface CreateAssistantRequest {
  name: string;
  region?: string;
  accessMode?: AccessMode;
  sshAllowedIps?: string;
  tailscaleAuthKey?: string;
}
