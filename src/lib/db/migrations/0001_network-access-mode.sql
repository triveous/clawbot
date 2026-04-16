CREATE TYPE "public"."access_mode" AS ENUM('ssh', 'tailscale_serve', 'tailscale_direct');--> statement-breakpoint
ALTER TABLE "assistants" ADD COLUMN "access_mode" "access_mode" DEFAULT 'ssh' NOT NULL;--> statement-breakpoint
ALTER TABLE "assistants" ADD COLUMN "ssh_allowed_ips" text;--> statement-breakpoint
ALTER TABLE "assistants" ADD COLUMN "firewall_id" text;--> statement-breakpoint
ALTER TABLE "assistants" ADD COLUMN "gateway_port" integer;--> statement-breakpoint
ALTER TABLE "assistant_credentials" ADD COLUMN "tailscale_auth_key" text;