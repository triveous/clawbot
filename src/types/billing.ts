export type PlanId = "starter" | "pro" | "power";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 19,
    features: [
      "1 agent",
      "2 vCPU, 4GB RAM",
      "Telegram + Web Chat",
      "Daily backups",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 39,
    features: [
      "1 agent (upgrade to 2)",
      "4 vCPU, 8GB RAM",
      "All channels",
      "Model switching",
      "Memory management",
    ],
  },
  power: {
    id: "power",
    name: "Power",
    priceMonthly: 79,
    features: [
      "Up to 3 agents",
      "8 vCPU, 16GB RAM",
      "All channels + multi-agent routing",
      "Region selection",
      "Priority support",
    ],
  },
};
