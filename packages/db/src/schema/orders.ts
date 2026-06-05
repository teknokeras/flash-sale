import { pgTable, uuid, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { flashSales } from "./flash-sales.js";
import { items } from "./items.js";

export const orders = pgTable("orders", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    saleId: uuid("sale_id").notNull().references(() => flashSales.id),
    itemId: uuid("item_id").notNull().references(() => items.id),
    priceCents: integer("price_cents").notNull(),
    status: text("status", {
        enum: ["confirmed", "cancelled", "refunded"],
    }).notNull().default("confirmed"),
    sqsMessageId: text("sqs_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    // Belt-and-suspenders: DynamoDB conditional write is the primary guard,
    // but this unique constraint is the last line of defense at the DB level
    oneOrderPerUserPerSale: unique().on(table.userId, table.saleId),
}));

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;