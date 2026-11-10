import { db, faturalar, odemeler, tahsilatEslesmeleri, bankaHesaplari } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { TahsilatDagitimInput } from "@workspace/api-zod";
import { finansKilidi, faturaDurumuHesapla, faturaOdenenKurus, kurusaCevir, kullanilabilirTahsilatlar } from "./faturaTahsilat";
import { hesapParaBirimleri } from "./bankaParaBirimleri";

export class TahsilatDagitimHatasi extends Error {}
function reddet(mesaj: string): never { throw new TahsilatDagitimHatasi(mesaj); }

/** Validation and all writes share the same financial lock and transaction. */
export async function topluTahsilatDagit(input: Omit<TahsilatDagitimInput, "tarih"> & { tarih?: string }) {
  const ids = input.dagitimlar.map(d => d.faturaId);
  if (new Set(ids).size !== ids.length) reddet("Bir fatura dağıtımda yalnızca bir kez yer alabilir");
  const amounts = input.dagitimlar.map(d => kurusaCevir(d.tutar));
  if (amounts.some(k => k == null || k <= 0)) reddet("Tutarlar sıfırdan büyük ve en fazla iki ondalıklı olmalı");
  const toplam = amounts.reduce<number>((s, k) => s + k!, 0);
  // odemeler.tutar is numeric(15, 2).
  if (!Number.isSafeInteger(toplam) || toplam > 999999999999999) reddet("Toplam tutar kayıt sınırını aşıyor");
  if (input.kaynak === "tahsilat" && (!input.tahsilatId || input.tarih || input.odemeYontemi || input.bankaHesabiId || input.aciklama)) {
    reddet("Mevcut tahsilat için yalnızca tahsilat seçimi ve dağıtım tutarlarını gönderin");
  }
  if (input.kaynak === "yeni" && (input.tahsilatId || !input.tarih || !input.odemeYontemi)) {
    reddet("Yeni tahsilat için tarih ve ödeme yöntemi gerekli");
  }
  if (input.kaynak === "yeni" && (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.tarih!) ||
    !Number.isFinite(Date.parse(input.tarih!)) ||
    new Date(input.tarih!).toISOString().slice(0, 10) !== input.tarih
  )) reddet("Geçerli bir tahsilat tarihi girin");

  return db.transaction(async tx => {
    await finansKilidi(tx, input.catiFirmaId);
    const fats = await tx.select().from(faturalar).where(and(
      eq(faturalar.catiFirmaId, input.catiFirmaId), inArray(faturalar.id, ids),
    )).orderBy(faturalar.id).for("update");
    if (fats.length !== ids.length) reddet("Seçilen faturalar bulunamadı veya bu çatı firmaya ait değil");
    const ilk = fats[0];
    if (fats.some(f => f.bagliFirmaId !== ilk.bagliFirmaId || f.paraBirimi !== ilk.paraBirimi)) {
      reddet("Birlikte dağıtılan faturalar aynı bağlı firma ve para biriminde olmalı");
    }
    for (const [i, d] of input.dagitimlar.entries()) {
      const f = fats.find(f => f.id === d.faturaId)!;
      if (["taslak", "iptal"].includes(f.durum)) reddet("Taslak veya iptal faturaya tahsilat dağıtılamaz");
      const kalan = Math.round(Number(f.genelToplam) * 100) - await faturaOdenenKurus(tx, f);
      if (amounts[i]! > kalan) reddet(`${f.faturaNo} için ayrılan tutar kalan borcu aşamaz`);
    }

    let tahsilatId: number;
    if (input.kaynak === "tahsilat") {
      const kaynaklar = await kullanilabilirTahsilatlar(tx, ilk);
      const secilen = kaynaklar.find(o => o.id === input.tahsilatId);
      if (!secilen || secilen.kalanKurus < toplam) {
        reddet("Seçilen tahsilat aynı firma ve para biriminde olmalı ve yeterli kullanılmamış tutarı bulunmalı");
      }
      tahsilatId = secilen.id;
    } else {
      if (input.bankaHesabiId) {
        const [hesap] = await tx.select().from(bankaHesaplari).where(eq(bankaHesaplari.id, input.bankaHesabiId)).for("share");
        if (!hesap || hesap.catiFirmaId !== input.catiFirmaId || !hesapParaBirimleri(hesap).includes(ilk.paraBirimi)) {
          reddet("Banka hesabı bu çatı firmaya ve para birimine uygun değil");
        }
      }
      const [row] = await tx.insert(odemeler).values({
        catiFirmaId: input.catiFirmaId, bagliFirmaId: ilk.bagliFirmaId,
        tip: "tahsilat", faturaId: null, tutar: (toplam / 100).toFixed(2),
        paraBirimi: ilk.paraBirimi, tarih: input.tarih!, odemeYontemi: input.odemeYontemi!,
        bankaHesabiId: input.bankaHesabiId ?? null,
        aciklama: input.aciklama || "Toplu fatura tahsilatı",
      }).returning();
      tahsilatId = row.id;
    }
    for (const [i, d] of input.dagitimlar.entries()) {
      const tutar = (amounts[i]! / 100).toFixed(2);
      await tx.insert(tahsilatEslesmeleri).values({ tahsilatId, faturaId: d.faturaId, tutar })
        .onConflictDoUpdate({ target: [tahsilatEslesmeleri.tahsilatId, tahsilatEslesmeleri.faturaId],
          set: { tutar: sql`${tahsilatEslesmeleri.tutar} + ${tutar}::numeric` } });
      await faturaDurumuHesapla(tx, d.faturaId);
    }
    return { tahsilatId, toplamTutar: toplam / 100 };
  });
}
