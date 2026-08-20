import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, odemeler, firmalar, bankaHesaplari } from "@workspace/db";
import { eq, or, inArray } from "drizzle-orm";
import { sirketErisimKontrol } from "../middleware/auth";
import { hesaplaParaBirimiBakiyeleri } from "../utils/cariBakiye";

const router = Router();

const AY_ADLARI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/**
 * Fatura başına ödenen tutarı hesaplar: yalnızca fatura para birimiyle eşleşen
 * "tahsilat" hareketleri toplanır (fatura detay API'siyle aynı mantık).
 */
function odenenTutarMap(
  fats: { id: number; paraBirimi: string | null }[],
  ods: { faturaId: number | null; tip: string; paraBirimi: string | null; tutar: string }[],
): Map<number, number> {
  const fatPb = new Map(fats.map(f => [f.id, f.paraBirimi]));
  const map = new Map<number, number>();
  for (const o of ods) {
    if (o.faturaId == null || o.tip !== "tahsilat" || !fatPb.has(o.faturaId)) continue;
    if (o.paraBirimi !== fatPb.get(o.faturaId)) continue;
    map.set(o.faturaId, (map.get(o.faturaId) ?? 0) + Number(o.tutar));
  }
  return map;
}

function filtreleCatiFirma<T extends { catiFirmaId: number }>(
  rows: T[], req: Parameters<typeof sirketErisimKontrol>[1], catiFirmaIdParam?: string
): T[] | null {
  if (catiFirmaIdParam) {
    if (!sirketErisimKontrol(Number(catiFirmaIdParam), req)) return null;
    return rows.filter(r => r.catiFirmaId === Number(catiFirmaIdParam));
  }
  if (req.kullanici?.rol === "yonetici") return rows;
  const izinli = req.izinliSirketler ?? [];
  return rows.filter(r => izinli.includes(r.catiFirmaId));
}

router.get("/dashboard/ozet", async (req, res) => {
  try {
    const { catiFirmaId } = req.query as Record<string, string>;

    const fatRows = await db.select().from(faturalar);
    const odRows = await db.select().from(odemeler);
    const firmaRows = await db.select().from(firmalar).where(eq(firmalar.tip, "bagli"));
    const bankaRows = await db.select().from(bankaHesaplari);

    const filtrelenmisFaturalar = filtreleCatiFirma(fatRows, req, catiFirmaId);
    const filtrelenmisOdemeler = filtreleCatiFirma(odRows, req, catiFirmaId);
    const filtrelenmisHesaplar = filtreleCatiFirma(bankaRows, req, catiFirmaId);

    if (!filtrelenmisFaturalar || !filtrelenmisOdemeler || !filtrelenmisHesaplar) {
      res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return;
    }

    const filtrelenmisCariler = catiFirmaId
      ? firmaRows.filter(f => f.ustFirmaId === Number(catiFirmaId))
      : (req.kullanici?.rol === "yonetici" ? firmaRows : firmaRows.filter(f => (req.izinliSirketler ?? []).includes(f.ustFirmaId!)));

    const today = new Date().toISOString().split("T")[0];
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().split("T")[0];

    const vadesGecmis = filtrelenmisFaturalar.filter(f =>
      f.vadeTarihi < today && (f.durum === "acik" || f.durum === "kismi_odendi")
    ).length;
    const vadesYaklasiyor = filtrelenmisFaturalar.filter(f =>
      f.vadeTarihi >= today && f.vadeTarihi <= in30Str && (f.durum === "acik" || f.durum === "kismi_odendi")
    ).length;
    const toplamAlacak = filtrelenmisFaturalar
      .filter(f => f.durum === "acik" || f.durum === "kismi_odendi")
      .reduce((s, f) => s + Number(f.genelToplam), 0);
    const toplamTahsilat = filtrelenmisOdemeler
      .filter(o => o.tip === "tahsilat")
      .reduce((s, o) => s + Number(o.tutar), 0);

    // Cariler ile ortak kural: borç − tahsilat, her para biriminde ayrı hesaplanır.
    const paraBirimiOzetleri = hesaplaParaBirimiBakiyeleri(
      filtrelenmisFaturalar,
      filtrelenmisOdemeler,
    ).map(d => ({
      paraBirimi: d.paraBirimi,
      toplamAlacak: d.toplamBorc,
      toplamTahsilat: d.toplamAlacak,
      kalanBakiye: d.bakiye,
    }));

    // Bakiye yalnızca hesabın para birimiyle eşleşen ödemelerden hesaplanır
    const bankaHesapBakiyeleri = filtrelenmisHesaplar.map(h => {
      const bakiye = odRows
        .filter(o => o.bankaHesabiId === h.id && (o.paraBirimi ?? "USD") === (h.paraBirimi ?? "USD"))
        .reduce((s, o) => s + (o.tip === "tahsilat" ? Number(o.tutar) : -Number(o.tutar)), 0);
      return { hesapId: h.id, bankaAdi: h.bankaAdi, hesapAdi: h.hesapAdi, paraBirimi: h.paraBirimi, bakiye };
    });

    res.json({
      toplamAlacak, toplamTahsilat, kalanBakiye: toplamAlacak - toplamTahsilat,
      toplamFaturaSayisi: filtrelenmisFaturalar.length,
      toplamOdemeSayisi: filtrelenmisOdemeler.length,
      toplamFirmaSayisi: filtrelenmisCariler.length,
      vadesGecmisFaturaSayisi: vadesGecmis,
      vadesYaklasiyor, paraBirimiOzetleri, bankaHesapBakiyeleri,
    });
  } catch {
    res.status(500).json({ error: "Dashboard verisi alınamadı" });
  }
});

router.get("/dashboard/vadesi-yaklasan", async (req, res) => {
  try {
    const { catiFirmaId, gun = "30" } = req.query as Record<string, string>;
    const today = new Date().toISOString().split("T")[0];
    const future = new Date(); future.setDate(future.getDate() + Number(gun));
    const futureStr = future.toISOString().split("T")[0];

    let rows = await db.select().from(faturalar)
      .where(or(eq(faturalar.durum, "acik"), eq(faturalar.durum, "kismi_odendi")));
    rows = rows.filter(f => f.vadeTarihi >= today && f.vadeTarihi <= futureStr);

    const scoped = filtreleCatiFirma(rows, req, catiFirmaId);
    if (!scoped) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const ilgiliOdemeler = scoped.length > 0
      ? await db.select().from(odemeler).where(inArray(odemeler.faturaId, scoped.map(f => f.id)))
      : [];
    const odenenMap = odenenTutarMap(scoped, ilgiliOdemeler);

    res.json(scoped.map(f => {
      const odenen = odenenMap.get(f.id) ?? 0;
      const kalan = Math.round((Number(f.genelToplam) - odenen) * 100) / 100;
      return {
        id: f.id, catiFirmaId: f.catiFirmaId, catiFirmaAd: null,
        bagliFirmaId: f.bagliFirmaId, bagliFirmaAd: null,
        gemiId: f.gemiId, gemiAd: null,
        faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
        paraBirimi: f.paraBirimi, durum: f.durum,
        toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
        genelToplam: Number(f.genelToplam), odenenTutar: odenen, kalanTutar: kalan,
        notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
      };
    }));
  } catch {
    res.status(500).json({ error: "Vadesi yaklaşan faturalar alınamadı" });
  }
});

router.get("/dashboard/son-islemler", async (req, res) => {
  try {
    const { catiFirmaId, limit = "10" } = req.query as Record<string, string>;
    const n = Number(limit);

    const allFats = await db.select().from(faturalar).orderBy(faturalar.olusturmaTarihi);
    const allOds = await db.select().from(odemeler).orderBy(odemeler.olusturmaTarihi);

    const scopedFats = filtreleCatiFirma(allFats, req, catiFirmaId);
    const scopedOds = filtreleCatiFirma(allOds, req, catiFirmaId);
    if (!scopedFats || !scopedOds) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const sonFats = scopedFats.slice(-n).reverse();
    const odenenMap = odenenTutarMap(sonFats, allOds);
    const sonFaturalar = sonFats.map(f => {
      const odenen = odenenMap.get(f.id) ?? 0;
      const kalan = Math.round((Number(f.genelToplam) - odenen) * 100) / 100;
      return {
        id: f.id, catiFirmaId: f.catiFirmaId, catiFirmaAd: null,
        bagliFirmaId: f.bagliFirmaId, bagliFirmaAd: null,
        gemiId: f.gemiId, gemiAd: null,
        faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
        paraBirimi: f.paraBirimi, durum: f.durum,
        toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
        genelToplam: Number(f.genelToplam), odenenTutar: odenen, kalanTutar: kalan,
        notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
      };
    });

    const sonOdemeler = scopedOds.slice(-n).reverse().map(o => ({
      id: o.id, catiFirmaId: o.catiFirmaId, catiFirmaAd: null,
      bagliFirmaId: o.bagliFirmaId, gemiId: o.gemiId, gemiAd: null,
      bankaHesabiId: o.bankaHesabiId, bankaHesabiAd: null,
      faturaId: o.faturaId, faturaNo: null, tip: o.tip, tarih: o.tarih,
      tutar: Number(o.tutar), paraBirimi: o.paraBirimi,
      odemeYontemi: o.odemeYontemi, aciklama: o.aciklama, olusturmaTarihi: o.olusturmaTarihi,
    }));

    res.json({ sonFaturalar, sonOdemeler });
  } catch {
    res.status(500).json({ error: "Son işlemler alınamadı" });
  }
});

router.get("/dashboard/aylik-gelir", async (req, res) => {
  try {
    const { catiFirmaId, yil, paraBirimi } = req.query as Record<string, string>;
    const hedefYil = Number(yil) || new Date().getFullYear();

    // Para birimi filtresi: farklı para birimleri tek sayıya toplanmasın diye
    // grafik istemcisi hedef para birimini belirtir.
    const allFats = (await db.select().from(faturalar)).filter(f => !paraBirimi || f.paraBirimi === paraBirimi);
    const allOds = (await db.select().from(odemeler).where(eq(odemeler.tip, "tahsilat"))).filter(o => !paraBirimi || o.paraBirimi === paraBirimi);

    const fats = filtreleCatiFirma(allFats, req, catiFirmaId);
    const ods = filtreleCatiFirma(allOds, req, catiFirmaId);
    if (!fats || !ods) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const result = Array.from({ length: 12 }, (_, i) => {
      const ay = i + 1;
      const prefix = `${hedefYil}-${String(ay).padStart(2, "0")}`;
      const toplamFatura = fats.filter(f => f.faturaTarihi.startsWith(prefix) && f.durum !== "taslak").reduce((s, f) => s + Number(f.genelToplam), 0);
      const toplamTahsilat = ods.filter(o => o.tarih.startsWith(prefix)).reduce((s, o) => s + Number(o.tutar), 0);
      return { yil: hedefYil, ay, ayAd: AY_ADLARI[i], toplamFatura, toplamTahsilat };
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: "Aylık gelir verisi alınamadı" });
  }
});

router.get("/dashboard/firma-gelir", async (req, res) => {
  try {
    const { catiFirmaId, yil, paraBirimi } = req.query as Record<string, string>;
    const hedefYil = Number(yil) || new Date().getFullYear();
    const prefix = String(hedefYil);

    const allFats = (await db.select().from(faturalar)).filter(f => !paraBirimi || f.paraBirimi === paraBirimi);
    const allOds = (await db.select().from(odemeler).where(eq(odemeler.tip, "tahsilat"))).filter(o => !paraBirimi || o.paraBirimi === paraBirimi);
    const catiFirmaRows = await db.select({ id: firmalar.id, ad: firmalar.ad }).from(firmalar).where(eq(firmalar.tip, "cati"));

    const fats = filtreleCatiFirma(allFats, req, catiFirmaId);
    const ods = filtreleCatiFirma(allOds, req, catiFirmaId);
    if (!fats || !ods) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const catiFirmaAdMap: Record<number, string> = {};
    for (const f of catiFirmaRows) catiFirmaAdMap[f.id] = f.ad;

    const map: Record<number, { catiFirmaId: number; catiFirmaAd: string; toplamFatura: number; toplamTahsilat: number }> = {};
    for (const f of fats.filter(f => f.faturaTarihi.startsWith(prefix) && f.durum !== "taslak")) {
      if (!map[f.catiFirmaId]) map[f.catiFirmaId] = { catiFirmaId: f.catiFirmaId, catiFirmaAd: catiFirmaAdMap[f.catiFirmaId] ?? String(f.catiFirmaId), toplamFatura: 0, toplamTahsilat: 0 };
      map[f.catiFirmaId].toplamFatura += Number(f.genelToplam);
    }
    for (const o of ods.filter(o => o.tarih.startsWith(prefix))) {
      if (!map[o.catiFirmaId]) map[o.catiFirmaId] = { catiFirmaId: o.catiFirmaId, catiFirmaAd: catiFirmaAdMap[o.catiFirmaId] ?? String(o.catiFirmaId), toplamFatura: 0, toplamTahsilat: 0 };
      map[o.catiFirmaId].toplamTahsilat += Number(o.tutar);
    }

    res.json(Object.values(map).filter(r => r.toplamFatura > 0 || r.toplamTahsilat > 0));
  } catch {
    res.status(500).json({ error: "Firma gelir verisi alınamadı" });
  }
});

export default router;
