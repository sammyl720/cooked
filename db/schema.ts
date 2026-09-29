import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const challenges = sqliteTable("challenges", {
  tokenHash: text("token_hash").primaryKey(),
  index: integer("index").notNull(),
  label: text("label").notNull(),
  mode: text("mode").notNull(),
  resultVersion: text("result_version").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
