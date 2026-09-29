import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const challenges = sqliteTable("challenges", {
  tokenHash: text("token_hash").primaryKey(),
  index: integer("index").notNull(),
  label: text("label").notNull(),
  mode: text("mode").notNull(),
  resultVersion: text("result_version").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const billingAccounts = sqliteTable("billing_accounts", {
  accountHash: text("account_hash").primaryKey(),
  credits: integer("credits").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const billingPurchases = sqliteTable("billing_purchases", {
  stripeSessionId: text("stripe_session_id").primaryKey(),
  stripeEventId: text("stripe_event_id").notNull(),
  accountHash: text("account_hash").notNull(),
  credits: integer("credits").notNull(),
  amountTotal: integer("amount_total"),
  currency: text("currency"),
  createdAt: integer("created_at").notNull(),
  appliedAt: integer("applied_at"),
}, (table) => [uniqueIndex("billing_purchases_event_idx").on(table.stripeEventId)]);
