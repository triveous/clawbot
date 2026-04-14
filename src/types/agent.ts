export type AgentStatus =
  | "creating"
  | "provisioning"
  | "running"
  | "stopped"
  | "error";

export type Provider = "hetzner";

export interface AgentResponse {
  id: string;
  name: string;
  status: AgentStatus;
  provider: Provider;
  ipv4: string | null;
  region: string;
  createdAt: string;
}

export interface CreateAgentRequest {
  name: string;
  region?: string;
}
