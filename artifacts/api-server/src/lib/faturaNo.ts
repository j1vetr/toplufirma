import { db, firmalar, faturalar, faturaSerileri } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

/** db.transaction callback'ine verilen transaction tipi. */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Fatura numarası üretimini sıraya sokan advisory lock sınıfı. */
export const FATURA_NO_KILIT_SINIFI = 823001;

/**
 * Otomatik fatura numarası tahsis eder. Fatura ekleyen TÜM yazarlar
 * (normal, tekrarlayan, teklif dönüştürme) bu yardımcıyı, faturayı ekledikleri
 * transaction içinde kullanmalıdır.
 *
 * Sıra:
 * 1. faturaSerisiId verildiyse o serinin sayacı atomik artırılır.
 * 2. Verilmediyse ve çatı firmanın varsayılan serisi varsa onun sayacı kullanılır.
 * 3. Seri yoksa count+1 ile numara üretilir.
 *
 * Advisory lock, aynı çatı firma için eşzamanlı tahsisleri sıraya sokar
 * (count+1 yarışı); seri sayacı ayrıca UPDATE ... RETURNING ile atomiktir.
 * Kilit transaction commit/rollback olunca kendiliğinden bırakılır.
 */
export async function faturaNoTahsisEt(
  tx: DbTx,
  catiFirmaId: number,
  faturaSerisiId?: number | null,
): Promise<{ faturaNo: string; faturaSerisiId: number | null }> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${FATURA_NO_KILIT_SINIFI}, ${catiFirmaId})`);

  let seriId = faturaSerisiId ?? null;
  if (seriId == null) {
    const [varsayilan] = await tx
      .select({ id: faturaSerileri.id })
      .from(faturaSerileri)
      .where(and(eq(faturaSerileri.catiFirmaId, catiFirmaId), eq(faturaSerileri.varsayilan, true)))
      .limit(1);
    seriId = varsayilan?.id ?? null;
  }

  if (seriId != null) {
    const [seri] = await tx
      .update(faturaSerileri)
      .set({ sonrakiNo: sql`${faturaSerileri.sonrakiNo} + 1` })
      .where(eq(faturaSerileri.id, seriId))
      .returning({ id: faturaSerileri.id, onek: faturaSerileri.onek, sonrakiNo: faturaSerileri.sonrakiNo });
    if (seri) {
      return {
        faturaNo: `${seri.onek}${String(seri.sonrakiNo - 1).padStart(6, "0")}`,
        faturaSerisiId: seri.id,
      };
    }
  }

  const [catiFirma] = await tx
    .select({ seriOneki: firmalar.seriOneki })
    .from(firmalar)
    .where(eq(firmalar.id, catiFirmaId));
  const prefix = catiFirma?.seriOneki ?? "FAT";
  const [count] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(faturalar)
    .where(eq(faturalar.catiFirmaId, catiFirmaId));
  return {
    faturaNo: `${prefix}${String(Number(count?.n ?? 0) + 1).padStart(6, "0")}`,
    faturaSerisiId: null,
  };
}
