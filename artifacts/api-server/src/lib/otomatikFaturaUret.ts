import { db } from "@workspace/db";
import { tekrarlayanFaturalar, tekrarlayanFaturaKalemleri, firmalar, faturalar, faturaKalemleri } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";

function sonrakiAyGunu(mevcutTarih: string, ayinGunu: number | null | undefined): string {
  const gun = Math.min(Math.max(ayinGunu ?? new Date(mevcutTarih).getDate(), 1), 28);
  const d = new Date(mevcutTarih);
  const nextMonth = d.getMonth() + 1;
  const nextYear = nextMonth > 11 ? d.getFullYear() + 1 : d.getFullYear();
  const normalizedMonth = nextMonth > 11 ? 0 : nextMonth;
  const maxDay = new Date(nextYear, normalizedMonth + 1, 0).getDate();
  const day = Math.min(gun, maxDay);
  return `${nextYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function tekrarlayandanFaturaUret(
  tr: typeof tekrarlayanFaturalar.$inferSelect,
): Promise<typeof faturalar.$inferSelect> {
  const [catiFirma] = await db.select().from(firmalar).where(eq(firmalar.id, tr.catiFirmaId));
  const prefix = catiFirma?.seriOneki ?? "FAT";
  const [count] = await db
    .select({ n: sql<number>`count(*)` })
    .from(faturalar)
    .where(eq(faturalar.catiFirmaId, tr.catiFirmaId));
  const faturaNo = `${prefix}${String(Number(count?.n ?? 0) + 1).padStart(6, "0")}`;

  const kalemler = await db
    .select()
    .from(tekrarlayanFaturaKalemleri)
    .where(eq(tekrarlayanFaturaKalemleri.tekrarlayanFaturaId, tr.id));

  type KalemRow = { aciklama: string; miktar: number; birimFiyat: number; kdvOrani: number };
  const kaynak: KalemRow[] = kalemler.length
    ? kalemler.map(k => ({ aciklama: k.aciklama, miktar: Number(k.miktar), birimFiyat: Number(k.birimFiyat), kdvOrani: Number(k.kdvOrani) }))
    : [{ aciklama: tr.aciklama, miktar: 1, birimFiyat: Number(tr.birimFiyat), kdvOrani: Number(tr.kdvOrani) }];

  let toplamTutar = 0, kdvTutari = 0;
  const kalemRows = kaynak.map(k => {
    const ara = k.miktar * k.birimFiyat;
    const kdv = ara * (k.kdvOrani / 100);
    toplamTutar += ara; kdvTutari += kdv;
    return {
      aciklama: k.aciklama, miktar: String(k.miktar), birimFiyat: String(k.birimFiyat),
      kdvOrani: String(k.kdvOrani), araToplam: String(ara), kdvTutari: String(kdv), genelToplam: String(ara + kdv),
    };
  });

  const faturaTarihi = tr.sonrakiTarih;
  const vadeDate = new Date(tr.sonrakiTarih);
  vadeDate.setDate(vadeDate.getDate() + 30);
  const vadeTarihi = vadeDate.toISOString().split("T")[0];

  const [fatura] = await db
    .insert(faturalar)
    .values({
      catiFirmaId: tr.catiFirmaId,
      bagliFirmaId: tr.bagliFirmaId,
      grupFirmaId: tr.grupFirmaId,
      gemiId: tr.gemiId,
      faturaNo,
      faturaTarihi,
      vadeTarihi,
      paraBirimi: tr.paraBirimi,
      durum: "taslak",
      toplamTutar: String(toplamTutar),
      kdvTutari: String(kdvTutari),
      genelToplam: String(toplamTutar + kdvTutari),
      aciklama: tr.aciklama,
    })
    .returning();

  for (const k of kalemRows) {
    await db.insert(faturaKalemleri).values({ faturaId: fatura.id, ...k });
  }

  const nextDate = sonrakiAyGunu(tr.sonrakiTarih, tr.ayinGunu);
  await db
    .update(tekrarlayanFaturalar)
    .set({ sonrakiTarih: nextDate })
    .where(eq(tekrarlayanFaturalar.id, tr.id));

  return fatura;
}

export async function otomatikFaturaUret(): Promise<void> {
  const bugun = new Date().toISOString().split("T")[0];

  const aktifler = await db
    .select()
    .from(tekrarlayanFaturalar)
    .where(and(eq(tekrarlayanFaturalar.aktif, true), lte(tekrarlayanFaturalar.sonrakiTarih, bugun)));

  for (const tr of aktifler) {
    try {
      await tekrarlayandanFaturaUret(tr);
    } catch (err) {
      console.error(`Tekrarlayan fatura ${tr.id} icin otomatik uretim basarisiz:`, err);
    }
  }
}
