import type { FinansalRapor, RaporFatura, RaporKirilim } from "@workspace/api-zod";
import type { faturalar, odemeler } from "@workspace/db";

export type RaporFaturaKaydi = {
  f: typeof faturalar.$inferSelect;
  catiFirmaAd: string | null;
  bagliFirmaAd: string | null;
  gemiAd: string | null;
  gemiImo: string | null;
};
export type RaporNakitKaydi = Pick<typeof odemeler.$inferSelect, "paraBirimi" | "tarih" | "tutar" | "tip">;
export type RaporFiltresi = { yil: number; ay?: number; paraBirimi: string };
const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const kurus = (n: number | string) => Math.round(Number(n) * 100);
const toplam = <T>(rows: T[], value: (row: T) => number | string) =>
  rows.reduce((s, row) => s + kurus(value(row)), 0) / 100;
const donemde = (tarih: string, filtre: RaporFiltresi) =>
  tarih.startsWith(`${filtre.yil}-`) && (!filtre.ay || Number(tarih.slice(5, 7)) === filtre.ay);

/** Invoice settlement is a present-day snapshot, cash is counted only by its original cash date. */
export function finansalRaporHesapla(
  kayitlar: RaporFaturaKaydi[], nakit: RaporNakitKaydi[], odenen: Record<number, number>,
  filtre: RaporFiltresi, simdi = new Date(),
): FinansalRapor {
  const gecerli = kayitlar.filter(r => !["taslak", "iptal"].includes(r.f.durum));
  const paraBirimleri = [...new Set([
    "USD", filtre.paraBirimi,
    ...gecerli.map(r => r.f.paraBirimi),
    ...nakit.map(r => r.paraBirimi),
  ])].sort();
  const yillar = [...new Set([
    simdi.getFullYear(), filtre.yil,
    ...gecerli.map(r => Number(r.f.faturaTarihi.slice(0, 4))),
    ...nakit.map(r => Number(r.tarih.slice(0, 4))),
  ])].sort((a, b) => b - a);
  const faturalar: RaporFatura[] = gecerli
    .filter(r => r.f.paraBirimi === filtre.paraBirimi && donemde(r.f.faturaTarihi, filtre))
    .map(({ f, catiFirmaAd, bagliFirmaAd, gemiAd }) => {
      const genelKurus = kurus(f.genelToplam);
      const odenenKurus = Math.max(0, Math.min(genelKurus, kurus(odenen[f.id] ?? 0)));
      return {
        id: f.id, catiFirmaId: f.catiFirmaId, catiFirmaAd: catiFirmaAd ?? "",
        bagliFirmaId: f.bagliFirmaId, bagliFirmaAd, gemiId: f.gemiId, gemiAd,
        faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
        paraBirimi: f.paraBirimi,
        durum: odenenKurus >= genelKurus ? "odendi" : odenenKurus > 0 ? "kismi_odendi" : "acik",
        toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
        genelToplam: genelKurus / 100, odenenTutar: odenenKurus / 100,
        kalanTutar: Math.max(0, genelKurus - odenenKurus) / 100,
      };
    }).sort((a, b) => b.faturaTarihi.localeCompare(a.faturaTarihi) || b.id - a.id);
  const hareketler = nakit.filter(o => o.paraBirimi === filtre.paraBirimi && donemde(o.tarih, filtre));
  const tahsilatlar = hareketler.filter(o => o.tip === "tahsilat");
  const odemeler = hareketler.filter(o => o.tip === "odeme");
  const faturalanan = toplam(faturalar, f => f.genelToplam);
  const nakitTahsilat = toplam(tahsilatlar, o => o.tutar), nakitOdeme = toplam(odemeler, o => o.tutar);
  const aylik = Array.from({ length: 12 }, (_, i) => i + 1)
    .filter(ay => !filtre.ay || filtre.ay === ay).map(ay => {
      const prefix = `${filtre.yil}-${String(ay).padStart(2, "0")}`;
      const fats = faturalar.filter(f => f.faturaTarihi.startsWith(prefix));
      const tahsilat = toplam(tahsilatlar.filter(o => o.tarih.startsWith(prefix)), o => o.tutar);
      const odeme = toplam(odemeler.filter(o => o.tarih.startsWith(prefix)), o => o.tutar);
      return {
        ay, tarih: `${prefix}-01`, ayAd: AY[ay - 1], sayi: fats.length,
        faturalanan: toplam(fats, f => f.genelToplam), faturayaSayilan: toplam(fats, f => f.odenenTutar),
        kalan: toplam(fats, f => f.kalanTutar), tahsilat, odeme,
        netNakit: (kurus(tahsilat) - kurus(odeme)) / 100,
      };
    });
  function kirilim(tip: "firma" | "gemi"): RaporKirilim[] {
    const map = new Map<number | null, RaporFatura[]>();
    for (const f of faturalar) {
      const id = tip === "firma" ? f.bagliFirmaId : f.gemiId;
      const list = map.get(id) ?? [];
      list.push(f); map.set(id, list);
    }
    return [...map].map(([id, rows]) => ({
      id, ad: (tip === "firma" ? rows[0].bagliFirmaAd : rows[0].gemiAd) ?? (tip === "firma" ? "Müşteri seçilmemiş" : "Gemi seçilmemiş"),
      imo: tip === "gemi" ? gecerli.find(r => r.f.gemiId === id)?.gemiImo ?? null : null,
      faturaSayisi: rows.length, faturalanan: toplam(rows, f => f.genelToplam),
      karsilanan: toplam(rows, f => f.odenenTutar), kalan: toplam(rows, f => f.kalanTutar),
    })).sort((a, b) => b.faturalanan - a.faturalanan);
  }
  const bugun = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(simdi);
  const gunFarki = (vade: string) => Math.round((Date.parse(`${bugun}T00:00:00Z`) - Date.parse(`${vade}T00:00:00Z`)) / 86400000);
  const araliklar = [
    { etiket: "Vadesi Gelmeyen", min: -Infinity, max: 0 },
    { etiket: "1-30 Gün", min: 1, max: 30 }, { etiket: "31-60 Gün", min: 31, max: 60 },
    { etiket: "61-90 Gün", min: 61, max: 90 }, { etiket: "91+ Gün", min: 91, max: Infinity },
  ];
  const yaslandirma = araliklar.map(d => {
    const rows = faturalar.filter(f => f.kalanTutar > 0 && gunFarki(f.vadeTarihi) >= d.min && gunFarki(f.vadeTarihi) <= d.max);
    return { etiket: d.etiket, kalan: toplam(rows, f => f.kalanTutar), faturaSayisi: rows.length, faturalar: rows };
  });
  const durumlar = ["acik", "kismi_odendi", "odendi"].map(durum => {
    const rows = faturalar.filter(f => f.durum === durum);
    return { durum, sayi: rows.length, tutar: toplam(rows, f => f.genelToplam) };
  }).filter(d => d.sayi > 0);
  const sirketler = new Map<number, RaporFatura[]>();
  for (const f of faturalar) {
    const rows = sirketler.get(f.catiFirmaId) ?? [];
    rows.push(f); sirketler.set(f.catiFirmaId, rows);
  }
  return {
    paraBirimi: filtre.paraBirimi, paraBirimleri, yillar, yil: filtre.yil, ay: filtre.ay ?? null,
    hesaplamaTarihi: simdi,
    ozet: {
      faturaSayisi: faturalar.length, toplamFatura: faturalanan,
      faturayaSayilan: toplam(faturalar, f => f.odenenTutar),
      kalanAlacak: toplam(faturalar, f => f.kalanTutar), nakitTahsilat, nakitOdeme,
      netNakit: (kurus(nakitTahsilat) - kurus(nakitOdeme)) / 100,
      donemNetHareketi: (kurus(faturalanan) + kurus(nakitOdeme) - kurus(nakitTahsilat)) / 100,
    }, aylik, durumlar, musteriler: kirilim("firma"), gemiler: kirilim("gemi"), yaslandirma, faturalar,
    kdv: {
      kdvHaricToplam: toplam(faturalar, f => f.toplamTutar),
      kdvTutariToplam: toplam(faturalar, f => f.kdvTutari),
      kdvDahilToplam: faturalanan,
      paraBirimiKirilim: faturalar.length ? [{
        paraBirimi: filtre.paraBirimi, kdvHaric: toplam(faturalar, f => f.toplamTutar),
        kdvTutari: toplam(faturalar, f => f.kdvTutari), kdvDahil: faturalanan,
      }] : [],
      firmaKirilim: [...sirketler].map(([id, rows]) => ({
        catiFirmaId: id, catiFirmaAd: rows[0].catiFirmaAd,
        kdvHaric: toplam(rows, f => f.toplamTutar), kdvTutari: toplam(rows, f => f.kdvTutari),
        kdvDahil: toplam(rows, f => f.genelToplam),
      })),
    },
  };
}
