CREATE TABLE `billing_accounts` (
	`account_hash` text PRIMARY KEY NOT NULL,
	`credits` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_purchases` (
	`stripe_session_id` text PRIMARY KEY NOT NULL,
	`stripe_event_id` text NOT NULL,
	`account_hash` text NOT NULL,
	`credits` integer NOT NULL,
	`amount_total` integer,
	`currency` text,
	`created_at` integer NOT NULL,
	`applied_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_purchases_event_idx` ON `billing_purchases` (`stripe_event_id`);