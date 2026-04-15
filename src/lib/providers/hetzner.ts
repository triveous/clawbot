import type {
  CreateServerOptions,
  CreateServerResult,
  ProviderInterface,
  ProviderServer,
} from "./types";
import { ProviderError } from "./types";

interface HetznerServerResponse {
  server: {
    id: number;
    public_net: {
      ipv4: { ip: string };
    };
    status: string;
  };
  root_password: string | null;
}

interface HetznerImageResponse {
  image: {
    id: number;
    status: string;
    description: string | null;
  };
}

interface HetznerActionResponse {
  action: {
    id: number;
    status: string;
  };
}

interface HetznerSshKeyResponse {
  ssh_key: {
    id: number;
    name: string;
  };
}

function mapStatus(
  hetznerStatus: string,
): ProviderServer["status"] {
  switch (hetznerStatus) {
    case "running":
      return "running";
    case "off":
      return "off";
    case "deleting":
      return "deleting";
    default:
      return "initializing";
  }
}

export class HetznerProvider implements ProviderInterface {
  private baseUrl = "https://api.hetzner.cloud/v1";
  private token: string;
  constructor() {
    const token = process.env.HETZNER_API_TOKEN;
    if (!token) throw new Error("HETZNER_API_TOKEN is required");
    this.token = token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new ProviderError(
        `Hetzner API error: ${res.status} ${body}`,
        res.status,
        "hetzner",
      );
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async createServer(opts: CreateServerOptions): Promise<CreateServerResult> {
    const body: Record<string, unknown> = {
      name: opts.name,
      server_type: opts.serverType,
      image: opts.image,
      location: opts.region,
      start_after_create: true,
    };

    if (opts.userData) {
      body.user_data = opts.userData;
    }

    if (opts.sshKeys && opts.sshKeys.length > 0) {
      body.ssh_keys = opts.sshKeys.map(Number);
    }

    const data = await this.request<HetznerServerResponse>("/servers", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      server: {
        id: String(data.server.id),
        ip: data.server.public_net.ipv4.ip,
        status: mapStatus(data.server.status),
      },
      rootPassword: data.root_password,
    };
  }

  async getServer(serverId: string): Promise<ProviderServer> {
    const data = await this.request<HetznerServerResponse>(
      `/servers/${serverId}`,
    );
    return {
      id: String(data.server.id),
      ip: data.server.public_net.ipv4.ip,
      status: mapStatus(data.server.status),
    };
  }

  async deleteServer(serverId: string): Promise<void> {
    await this.request(`/servers/${serverId}`, { method: "DELETE" });
  }

  async powerOn(serverId: string): Promise<void> {
    await this.request<HetznerActionResponse>(
      `/servers/${serverId}/actions/poweron`,
      { method: "POST" },
    );
  }

  async powerOff(serverId: string): Promise<void> {
    await this.request<HetznerActionResponse>(
      `/servers/${serverId}/actions/poweroff`,
      { method: "POST" },
    );
  }

  async reboot(serverId: string): Promise<void> {
    await this.request<HetznerActionResponse>(
      `/servers/${serverId}/actions/reboot`,
      { method: "POST" },
    );
  }

  async createImage(
    serverId: string,
    description: string,
  ): Promise<{ imageId: string }> {
    const data = await this.request<HetznerImageResponse>(
      `/servers/${serverId}/actions/create_image`,
      {
        method: "POST",
        body: JSON.stringify({ type: "snapshot", description }),
      },
    );
    return { imageId: String(data.image.id) };
  }

  async getImage(
    imageId: string,
  ): Promise<{ status: string; description: string | null }> {
    const data = await this.request<HetznerImageResponse>(
      `/images/${imageId}`,
    );
    return { status: data.image.status, description: data.image.description };
  }

  async createSshKey(
    name: string,
    publicKey: string,
  ): Promise<{ keyId: string }> {
    const data = await this.request<HetznerSshKeyResponse>("/ssh_keys", {
      method: "POST",
      body: JSON.stringify({ name, public_key: publicKey }),
    });
    return { keyId: String(data.ssh_key.id) };
  }

  async deleteSshKey(keyId: string): Promise<void> {
    await this.request(`/ssh_keys/${keyId}`, { method: "DELETE" });
  }

  async deleteImage(imageId: string): Promise<void> {
    await this.request(`/images/${imageId}`, { method: "DELETE" });
  }
}
