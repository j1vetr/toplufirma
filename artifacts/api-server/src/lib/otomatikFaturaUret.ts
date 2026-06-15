import { db } from "@workspace/db";
import { tekrarlayanFaturalar, firmalar, faturalar, faturaKalemleri } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function otomatikFaturaUret(): Promise<void> {
  const bugun = new Date().toISOString().split("T")[0];

  const aktifler = await db
    .select()
    .from(tekrarlayanFaturalar)
    .where(and(eq(tekrarlayanFaturalar.aktif, true), lte(tekrarlayanFaturalar.sonrakiTarih, bugun)));

  for (const tr of aktifler) {
    try {
      const [catiFirma] = await db.select().from(firmalar).where(eq(firmalar.id, tr.catiFirmaId));
      const prefix = catiFirma?.seriOneki ?? "FAT";
      const [count] = await db
        .select({ n: sql<number>`count(*)` })
        .from(faturalar)
        .where(eq(faturalar.catiFirmaId, tr.catiFirmaId));
      const faturaNo = `${prefix}${String(Number(count?.n ?? 0) + 1).padStart(6, "0")}`;

      const ara = Number(tr.birimFiyat);
      const kdv = ara * (Number(tr.kdvOrani) / 100);
      const genelToplam = ara + kdv;

      const faturaTarihi = tr.sonrakiTarih;
      const vadeDate = new Date(tr.sonrakiTarih);
      vadeDate.setDate(vadeDate.getDate() + 30);
      const vadeTarihi = vadeDate.toISOString().split("T")[0];

      const [fatura] = await db
        .insert(faturalar)
        .values({
          catiFirmaId: tr.catiFirmaId,
          bagliFirmaId: tr.bagliFirmaId,
          gemiId: tr.gemiId,
          faturaNo,
          faturaTarihi,
          vadeTarihi,
          paraBirimi: tr.paraBirimi,
          durum: "acik",
          toplamTutar: String(ara),
          kdvTutari: String(kdv),
          genelToplam: String(genelToplam),
          aciklama: tr.aciklama,
        })
        .returning();

      await db.insert(faturaKalemleri).values({
        faturaId: fatura.id,
        aciklama: tr.aciklama,
        miktar: "1",
        birimFiyat: String(ara),
        kdvOrani: String(tr.kdvOrani),
        araToplam: String(ara),
        kdvTutari: String(kdv),
        genelToplam: String(genelToplam),
      });

      const nextDate = new Date(tr.sonrakiTarih);
      nextDate.setMonth(nextDate.getMonth() + 1);
      await db
        .update(tekrarlayanFaturalar)
        .set({ sonrakiTarih: nextDate.toISOString().split("T")[0] })
        .where(eq(tekrarlayanFaturalar.id, tr.id));
    } catch (err) {
      console.error(`Tekrarlayan fatura ${tr.id} icin otomatik uretim basarisiz:`, err);
    }
  }
}
