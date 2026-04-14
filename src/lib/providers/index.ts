import { HetznerProvider } from "./hetzner";
import type { ProviderInterface } from "./types";

export function getProvider(name: string): ProviderInterface {
  if (name === "hetzner") return new HetznerProvider();
  throw new Error(`Unknown provider: ${name}`);
}

export function getHetznerProvider(): HetznerProvider {
  return new HetznerProvider();
}
