import { db } from "@workspace/db";
import { tekrarlayanFaturalar, tekrarlayanFaturaKalemleri, faturalar, faturaKalemleri } from "@workspace/db";
import { eq, and, lte, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { faturaNoTahsisEt } from "./faturaNo";

/** Üretim sırasında beklenen, kullanıcıya gösterilebilir hatalar. */
export class TekrarUretimHatasi extends Error {
  constructor(
    message: string,
    public readonly kod: "bulunamadi" | "pasif" | "donem_mevcut",
    public readonly mevcutFaturaNo?: string,
  ) {
    super(message);
    this.name = "TekrarUretimHatasi";
  }
}

/** Fatura dönemi: tarihin YYYY-MM kısmı. */
export function donemHesapla(tarih: string): string {
  return tarih.slice(0, 7);
}

export function sonrakiAyGunu(mevcutTarih: string, ayinGunu: number | null | undefined): string {
  const gun = Math.min(Math.max(ayinGunu ?? new Date(mevcutTarih).getDate(), 1), 28);
  const d = new Date(mevcutTarih);
  const nextMonth = d.getMonth() + 1;
  const nextYear = nextMonth > 11 ? d.getFullYear() + 1 : d.getFullYear();
  const normalizedMonth = nextMonth > 11 ? 0 : nextMonth;
  const maxDay = new Date(nextYear, normalizedMonth + 1, 0).getDate();
  const day = Math.min(gun, maxDay);
  return `${nextYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Tekrarlayan tanımdan tek bir taslak fatura üretir.
 *
 * Güvenceler:
 * - Tanım satırı transaction içinde FOR UPDATE ile kilitlenir; aynı tanım için
 *   eşzamanlı üretimler sıraya girer.
 * - `beklenenDonem` verildiyse ve kilit sonrası tanımın dönemi değiştiyse
 *   (başka bir üretim takvimi ilerletmişse) mükerrer üretim reddedilir.
 * - Aynı tanım + dönem için mevcut fatura varsa üretim reddedilir; ayrıca
 *   DB'deki unique index (faturalar_tekrar_donem_unq) son güvence olarak durur.
 * - Fatura numarası, aynı çatı firma için advisory lock altında hesaplanır
 *   (eşzamanlı üretimde çakışan numara önlenir).
 */
export async function tekrarlayandanFaturaUret(
  tekrarlayanId: number,
  beklenenDonem?: string,
): Promise<typeof faturalar.$inferSelect> {
  return await db.transaction(async (tx) => {
    const [tr] = await tx
      .select()
      .from(tekrarlayanFaturalar)
      .where(eq(tekrarlayanFaturalar.id, tekrarlayanId))
      .for("update");
    if (!tr) throw new TekrarUretimHatasi("Tekrarlayan fatura bulunamadı", "bulunamadi");
    if (!tr.aktif) throw new TekrarUretimHatasi("Pasif tanımdan fatura üretilemez. Önce tanımı aktifleştirin.", "pasif");

    const donem = donemHesapla(tr.sonrakiTarih);

    // Kilit alınana kadar başka bir üretim takvimi ilerletmiş olabilir.
    const kontrolDonemi = beklenenDonem ?? donem;
    if (beklenenDonem && donem !== beklenenDonem) {
      const [mevcut] = await tx
        .select({ faturaNo: faturalar.faturaNo })
        .from(faturalar)
        .where(and(eq(faturalar.tekrarlayanFaturaId, tr.id), eq(faturalar.tekrarDonemi, beklenenDonem)));
      throw new TekrarUretimHatasi(
        `${beklenenDonem} dönemi için fatura zaten üretilmiş${mevcut ? ` (${mevcut.faturaNo})` : ""}`,
        "donem_mevcut",
        mevcut?.faturaNo,
      );
    }

    const [mevcut] = await tx
      .select({ faturaNo: faturalar.faturaNo })
      .from(faturalar)
      .where(and(eq(faturalar.tekrarlayanFaturaId, tr.id), eq(faturalar.tekrarDonemi, kontrolDonemi)));
    if (mevcut) {
      throw new TekrarUretimHatasi(
        `${kontrolDonemi} dönemi için fatura zaten üretilmiş (${mevcut.faturaNo})`,
        "donem_mevcut",
        mevcut.faturaNo,
      );
    }

    // Numara tahsisi: tüm fatura yazarlarıyla ortak yardımcı (varsayılan seri
    // varsa onun sayacı, yoksa count+1) — aynı advisory lock altında.
    const { faturaNo, faturaSerisiId } = await faturaNoTahsisEt(tx, tr.catiFirmaId);

    const kalemler = await tx
      .select()
      .from(tekrarlayanFaturaKalemleri)
      .where(eq(tekrarlayanFaturaKalemleri.tekrarlayanFaturaId, tr.id));

    type KalemRow = { aciklama: string; birim: string; miktar: number; birimFiyat: number; kdvOrani: number };
    const kaynak: KalemRow[] = kalemler.length
      ? kalemler.map(k => ({ aciklama: k.aciklama, birim: k.birim ?? "Pcs", miktar: Number(k.miktar), birimFiyat: Number(k.birimFiyat), kdvOrani: Number(k.kdvOrani) }))
      : [{ aciklama: tr.aciklama, birim: "Pcs", miktar: 1, birimFiyat: Number(tr.birimFiyat), kdvOrani: Number(tr.kdvOrani) }];

    let toplamTutar = 0, kdvTutari = 0;
    const kalemRows = kaynak.map(k => {
      const ara = k.miktar * k.birimFiyat;
      const kdv = ara * (k.kdvOrani / 100);
      toplamTutar += ara; kdvTutari += kdv;
      return {
        aciklama: k.aciklama, birim: k.birim, miktar: String(k.miktar), birimFiyat: String(k.birimFiyat),
        kdvOrani: String(k.kdvOrani), araToplam: String(ara), kdvTutari: String(kdv), genelToplam: String(ara + kdv),
      };
    });

    const faturaTarihi = tr.sonrakiTarih;
    const vadeDate = new Date(tr.sonrakiTarih);
    vadeDate.setDate(vadeDate.getDate() + 30);
    const vadeTarihi = vadeDate.toISOString().split("T")[0];

    let fatura: typeof faturalar.$inferSelect;
    try {
      [fatura] = await tx
        .insert(faturalar)
        .values({
          catiFirmaId: tr.catiFirmaId,
          bagliFirmaId: tr.bagliFirmaId,
          grupFirmaId: tr.grupFirmaId,
          gemiId: tr.gemiId,
          faturaSerisiId,
          faturaNo,
          faturaTarihi,
          vadeTarihi,
          paraBirimi: tr.paraBirimi,
          durum: "taslak",
          toplamTutar: String(toplamTutar),
          kdvTutari: String(kdvTutari),
          genelToplam: String(toplamTutar + kdvTutari),
          aciklama: tr.aciklama,
          tekrarlayanFaturaId: tr.id,
          tekrarDonemi: donem,
        })
        .returning();
    } catch (err) {
      // Unique index (tanım + dönem) son güvence: yarış kaybedilirse net hata ver.
      if ((err as { code?: string })?.code === "23505") {
        throw new TekrarUretimHatasi(`${donem} dönemi için fatura zaten üretilmiş`, "donem_mevcut");
      }
      throw err;
    }

    for (const k of kalemRows) {
      await tx.insert(faturaKalemleri).values({ faturaId: fatura.id, ...k });
    }

    const nextDate = sonrakiAyGunu(tr.sonrakiTarih, tr.ayinGunu);
    await tx
      .update(tekrarlayanFaturalar)
      .set({ sonrakiTarih: nextDate })
      .where(eq(tekrarlayanFaturalar.id, tr.id));

    return fatura;
  });
}

export async function otomatikFaturaUret(): Promise<void> {
  const bugun = new Date().toISOString().split("T")[0];

  const aktifler = await db
    .select()
    .from(tekrarlayanFaturalar)
    .where(and(eq(tekrarlayanFaturalar.aktif, true), lte(tekrarlayanFaturalar.sonrakiTarih, bugun)));

  for (const tr of aktifler) {
    try {
      await tekrarlayandanFaturaUret(tr.id, donemHesapla(tr.sonrakiTarih));
    } catch (err) {
      if (err instanceof TekrarUretimHatasi && err.kod === "donem_mevcut") {
        // Bu dönem zaten faturalanmış: takvimi ilerlet ki her gün yeniden denenmesin.
        // Korumalı güncelleme: tarih, gün veya aktiflik bu arada değiştiyse
        // (eşzamanlı bir düzenleme) dokunma; bir sonraki turda güncel haliyle ele alınır.
        await db
          .update(tekrarlayanFaturalar)
          .set({ sonrakiTarih: sonrakiAyGunu(tr.sonrakiTarih, tr.ayinGunu) })
          .where(and(
            eq(tekrarlayanFaturalar.id, tr.id),
            eq(tekrarlayanFaturalar.sonrakiTarih, tr.sonrakiTarih),
            eq(tekrarlayanFaturalar.aktif, true),
            tr.ayinGunu == null
              ? isNull(tekrarlayanFaturalar.ayinGunu)
              : eq(tekrarlayanFaturalar.ayinGunu, tr.ayinGunu),
          ));
        continue;
      }
      console.error(`Tekrarlayan fatura ${tr.id} icin otomatik uretim basarisiz:`, err);
    }
  }
}
