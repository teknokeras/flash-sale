import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { items } from "./items.js";

export const flashSales = pgTable("flash_sales", {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").references(() => items.id),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status", {
        enum: ["draft", "scheduled", "active", "ended", "cancelled"],
    }).notNull().default("draft"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FlashSale = typeof flashSales.$inferSelect;
export type NewFlashSale = typeof flashSales.$inferInsert;