import { pgTable, serial, integer, numeric, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { odemeler, faturalar } from "./index";

// A matching is NOT a cash movement. Ledger totals continue to use odemeler.
export const tahsilatEslesmeleri = pgTable("tahsilat_eslesmeleri", {
  id: serial("id").primaryKey(),
  tahsilatId: integer("tahsilat_id").notNull().references(() => odemeler.id, { onDelete: "cascade" }),
  faturaId: integer("fatura_id").notNull().references(() => faturalar.id, { onDelete: "cascade" }),
  tutar: numeric("tutar", { precision: 15, scale: 2 }).notNull(),
  olusturmaTarihi: timestamp("olusturma_tarihi").notNull().defaultNow(),
}, table => [
  uniqueIndex("tahsilat_fatura_eslesme_unique").on(table.tahsilatId, table.faturaId),
  check("tahsilat_eslesme_pozitif", sql`${table.tutar} > 0`),
]);
export const insertTahsilatEslesmeSchema = createInsertSchema(tahsilatEslesmeleri).omit({ id: true, olusturmaTarihi: true });
export type TahsilatEslesme = typeof tahsilatEslesmeleri.$inferSelect;
