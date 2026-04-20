export interface ProviderServer {
  id: string;
  ip: string;
  status: "initializing" | "running" | "off" | "deleting";
}

export interface FirewallRule {
  direction: "in" | "out";
  protocol: "tcp" | "udp" | "icmp";
  port?: string;
  source_ips?: string[];
}

export interface CreateServerOptions {
  name: string;
  image: string;
  region: string;
  serverType: string;
  userData?: string;
  sshKeys?: string[];
  firewalls?: string[];
}

export interface CreateServerResult {
  server: ProviderServer;
  rootPassword: string | null;
}

export interface ProviderInterface {
  createServer(opts: CreateServerOptions): Promise<CreateServerResult>;
  getServer(serverId: string): Promise<ProviderServer>;
  deleteServer(serverId: string): Promise<void>;
  powerOn(serverId: string): Promise<void>;
  powerOff(serverId: string): Promise<void>;
  reboot(serverId: string): Promise<void>;
  createFirewall(
    name: string,
    rules: FirewallRule[],
  ): Promise<{ firewallId: string }>;
  attachFirewall(firewallId: string, serverId: string): Promise<void>;
  detachFirewall(firewallId: string, serverId: string): Promise<void>;
  deleteFirewall(firewallId: string): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public provider: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
