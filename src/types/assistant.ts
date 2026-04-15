export type AssistantStatus =
  | "creating"
  | "provisioning"
  | "running"
  | "stopped"
  | "error";

export type Provider = "hetzner";

export interface AssistantResponse {
  id: string;
  name: string;
  status: AssistantStatus;
  provider: Provider;
  ipv4: string | null;
  hostname: string | null;
  region: string;
  createdAt: string;
}

export interface CreateAssistantRequest {
  name: string;
  region?: string;
}
