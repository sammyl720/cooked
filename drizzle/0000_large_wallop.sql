CREATE TABLE `challenges` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`index` integer NOT NULL,
	`label` text NOT NULL,
	`mode` text NOT NULL,
	`result_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
