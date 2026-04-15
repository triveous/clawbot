export interface ProviderServer {
  id: string;
  ip: string;
  status: "initializing" | "running" | "off" | "deleting";
}

export interface CreateServerOptions {
  name: string;
  image: string;
  region: string;
  serverType: string;
  userData?: string;
  sshKeys?: string[];
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
