export type ChannelType =
  | "telegram"
  | "whatsapp"
  | "discord"
  | "slack"
  | "web";

export interface ChannelDefinition {
  type: ChannelType;
  name: string;
  description: string;
  requiredFields: ChannelField[];
}

export interface ChannelField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder: string;
  helpText?: string;
}

export interface ChannelHealthStatus {
  channelType: ChannelType;
  status: "healthy" | "degraded" | "down" | "unknown";
  lastChecked: string | null;
  message?: string;
}
