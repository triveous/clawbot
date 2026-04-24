CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_id_unique` ON `users` (`clerk_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`billing_customer_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`tagline` text,
	`price_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`tier` integer NOT NULL,
	`provider_spec` text NOT NULL,
	`billing_provider_ids` text DEFAULT '{}' NOT NULL,
	`resource_limits` text DEFAULT '{}' NOT NULL,
	`benefits` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_slug_unique` ON `plans` (`slug`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`stripe_subscription_id` text NOT NULL,
	`stripe_customer_id` text NOT NULL,
	`stripe_schedule_id` text,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`canceled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_stripe_subscription_id_unique` ON `subscriptions` (`stripe_subscription_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_org_status_idx` ON `subscriptions` (`org_id`,`status`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`subscription_id` text,
	`stripe_invoice_id` text NOT NULL,
	`stripe_customer_id` text NOT NULL,
	`number` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`amount_due` integer DEFAULT 0 NOT NULL,
	`amount_paid` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`period_start` integer,
	`period_end` integer,
	`hosted_invoice_url` text,
	`invoice_pdf` text,
	`issued_at` integer,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_stripe_invoice_id_unique` ON `invoices` (`stripe_invoice_id`);--> statement-breakpoint
CREATE INDEX `invoices_org_issued_idx` ON `invoices` (`org_id`,`issued_at`);--> statement-breakpoint
CREATE INDEX `invoices_subscription_idx` ON `invoices` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `assistants` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`created_by_user_id` text,
	`plan_id` text NOT NULL,
	`instance_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`provider` text DEFAULT 'hetzner' NOT NULL,
	`hostname` text,
	`dns_record_id` text,
	`dns_zone_id` text,
	`dns_base_domain` text,
	`access_mode` text DEFAULT 'ssh' NOT NULL,
	`ssh_allowed_ips` text,
	`region` text DEFAULT 'fsn1' NOT NULL,
	`last_error_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `instances` (
	`id` text PRIMARY KEY NOT NULL,
	`assistant_id` text NOT NULL,
	`provider` text DEFAULT 'hetzner' NOT NULL,
	`provider_server_id` text,
	`provider_snapshot_id` text NOT NULL,
	`firewall_id` text,
	`ipv4` text,
	`region` text NOT NULL,
	`gateway_port` integer,
	`status` text DEFAULT 'creating' NOT NULL,
	`last_error` text,
	`workflow_run_id` text,
	`destroyed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assistant_id`) REFERENCES `assistants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assistant_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`source` text DEFAULT 'stripe' NOT NULL,
	`subscription_id` text,
	`external_subscription_id` text,
	`current_period_start` integer,
	`current_period_end` integer,
	`consumed_by_assistant_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`consumed_by_assistant_id`) REFERENCES `assistants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_credits_external_subscription_id_unique` ON `assistant_credits` (`external_subscription_id`);--> statement-breakpoint
CREATE INDEX `assistant_credits_org_status_plan_idx` ON `assistant_credits` (`org_id`,`status`,`plan_id`);--> statement-breakpoint
CREATE TABLE `instance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`step` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`payload` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `instance_events_instance_created_idx` ON `instance_events` (`instance_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `assistant_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`assistant_id` text NOT NULL,
	`root_credential_type` text NOT NULL,
	`root_credential` text NOT NULL,
	`gateway_token` text NOT NULL,
	`gateway_port` integer DEFAULT 18789 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assistant_id`) REFERENCES `assistants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_credentials_assistant_id_unique` ON `assistant_credentials` (`assistant_id`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'hetzner' NOT NULL,
	`provider_snapshot_id` text NOT NULL,
	`version` text NOT NULL,
	`openclaw_version` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
