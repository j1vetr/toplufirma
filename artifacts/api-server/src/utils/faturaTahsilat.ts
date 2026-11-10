import { db, faturalar, odemeler, tahsilatEslesmeleri } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";

export type FinansTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type FinansDb = FinansTx | typeof db;
export function kurusaCevir(t: unknown): number | null {
  if (typeof t !== "number" && typeof t !== "string") return null;
  const n = Number(t), k = Math.round(n * 100);
  return Number.isSafeInteger(k) && Math.abs(n * 100 - k) < 1e-6 ? k : null;
}
/** All writers take this before invoice/payment locks, including deletes. */
export async function finansKilidi(tx: FinansTx, catiFirmaId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(81027, ${catiFirmaId}::integer)`);
}
export async function faturaOdenenKurus(tx: FinansDb, fat: typeof faturalar.$inferSelect, haricOdemeId?: number) {
  const rows = await tx.select().from(odemeler).where(eq(odemeler.faturaId, fat.id));
  const [matched] = await tx.select({ toplam: sql<string>`coalesce(sum(${tahsilatEslesmeleri.tutar}), 0)` })
    .from(tahsilatEslesmeleri).where(eq(tahsilatEslesmeleri.faturaId, fat.id));
  return rows.filter(o => o.tip === "tahsilat" && o.paraBirimi === fat.paraBirimi && o.id !== haricOdemeId)
    .reduce((s, o) => s + Math.round(Number(o.tutar) * 100), Math.round(Number(matched.toplam) * 100));
}
export async function faturaDurumuHesapla(tx: FinansDb, id: number) {
  const [f] = await tx.select().from(faturalar).where(eq(faturalar.id, id));
  if (!f || f.durum === "taslak" || f.durum === "iptal") return;
  const paid = await faturaOdenenKurus(tx, f);
  const durum = paid >= Math.round(Number(f.genelToplam) * 100) ? "odendi" : paid > 0 ? "kismi_odendi" : "acik";
  await tx.update(faturalar).set({ durum }).where(eq(faturalar.id, id));
}
export async function kullanilabilirTahsilatlar(tx: FinansDb, fat: typeof faturalar.$inferSelect) {
  const receipts = await tx.select().from(odemeler).where(and(
    eq(odemeler.catiFirmaId, fat.catiFirmaId), eq(odemeler.bagliFirmaId, fat.bagliFirmaId),
    eq(odemeler.paraBirimi, fat.paraBirimi), eq(odemeler.tip, "tahsilat"),
    sql`${odemeler.faturaId} is null`,
  )).orderBy(odemeler.tarih, odemeler.id);
  if (!receipts.length) return [];
  const used = await tx.select({ id: tahsilatEslesmeleri.tahsilatId, toplam: sql<string>`sum(${tahsilatEslesmeleri.tutar})` })
    .from(tahsilatEslesmeleri).groupBy(tahsilatEslesmeleri.tahsilatId);
  const sums = new Map(used.map(r => [r.id, Math.round(Number(r.toplam) * 100)]));
  return receipts.map(o => ({ ...o, kalanKurus: Math.round(Number(o.tutar) * 100) - (sums.get(o.id) ?? 0) }))
    .filter(o => o.kalanKurus > 0);
}

export async function tahsilatDagitimlari(ids: number[]) {
  const map = new Map<number, { faturaId: number; faturaNo: string; tutar: number }[]>();
  if (!ids.length) return map;
  const rows = await db.select({ tahsilatId: tahsilatEslesmeleri.tahsilatId, faturaId: faturalar.id,
    faturaNo: faturalar.faturaNo, tutar: tahsilatEslesmeleri.tutar })
    .from(tahsilatEslesmeleri).innerJoin(faturalar, eq(tahsilatEslesmeleri.faturaId, faturalar.id))
    .where(inArray(tahsilatEslesmeleri.tahsilatId, ids)).orderBy(tahsilatEslesmeleri.id);
  for (const r of rows) map.set(r.tahsilatId, [...(map.get(r.tahsilatId) ?? []), {
    faturaId: r.faturaId, faturaNo: r.faturaNo, tutar: Number(r.tutar),
  }]);
  return map;
}

export async function faturaOdenenMap(fats: { id: number; paraBirimi: string }[], tx: FinansDb = db) {
  const map: Record<number, number> = {};
  if (!fats.length) return map;
  const ids = fats.map(f => f.id), currencies = new Map(fats.map(f => [f.id, f.paraBirimi]));
  const payments = await tx.select().from(odemeler).where(inArray(odemeler.faturaId, ids));
  const matches = await tx.select().from(tahsilatEslesmeleri).where(inArray(tahsilatEslesmeleri.faturaId, ids));
  const kuruslar: Record<number, number> = {};
  for (const p of payments) {
    if (p.faturaId && p.tip === "tahsilat" && p.paraBirimi === currencies.get(p.faturaId)) {
      kuruslar[p.faturaId] = (kuruslar[p.faturaId] ?? 0) + Math.round(Number(p.tutar) * 100);
    }
  }
  for (const e of matches) kuruslar[e.faturaId] = (kuruslar[e.faturaId] ?? 0) + Math.round(Number(e.tutar) * 100);
  for (const [id, k] of Object.entries(kuruslar)) map[Number(id)] = k / 100;
  return map;
}
