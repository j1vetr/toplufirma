import { db, faturalar, gemiler } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

type EkstreSatiri = {
  id: number | string;
  tip: string;
  aciklama: string | null;
  faturaId?: number | null;
};

export function gemiAciklamalariniUygula<T extends EkstreSatiri>(
  satirlar: T[], gemiAdlari: ReadonlyMap<number, string | null>,
): T[] {
  return satirlar.map(satir => satir.tip === "fatura"
    ? { ...satir, aciklama: gemiAdlari.get(satir.faturaId ?? Number(satir.id))?.trim() || "-" }
    : satir);
}

/** Enrich export rows in one query without changing source records or balances. */
export async function ekstreGemiAciklamalari<T extends EkstreSatiri>(satirlar: T[]): Promise<T[]> {
  const ids = [...new Set(satirlar.filter(s => s.tip === "fatura")
    .map(s => s.faturaId ?? Number(s.id)))];
  if (!ids.length) return satirlar;
  const rows = await db.select({ id: faturalar.id, gemiAd: gemiler.ad })
    .from(faturalar)
    .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
    .where(inArray(faturalar.id, ids));
  return gemiAciklamalariniUygula(satirlar, new Map(rows.map(r => [r.id, r.gemiAd])));
}
