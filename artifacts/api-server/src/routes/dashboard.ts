import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, odemeler, cariler, starlinkPlanlari, bankaHesaplari } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { sirketErisimKontrol } from "../middleware/auth";

const router = Router();

const AY_ADLARI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function izinliMi(sirketId: number, req: Parameters<typeof sirketErisimKontrol>[1]): boolean {
  return sirketErisimKontrol(sirketId, req);
}

function filtreleSirket<T extends { sirketId: number }>(rows: T[], req: Parameters<typeof izinliMi>[1], sirketIdParam?: string): T[] | null {
  if (sirketIdParam) {
    if (!izinliMi(Number(sirketIdParam), req)) return null;
    return rows.filter(r => r.sirketId === Number(sirketIdParam));
  }
  if (req.kullanici?.rol === "yonetici") return rows;
  const izinli = req.izinliSirketler ?? [];
  return rows.filter(r => izinli.includes(r.sirketId));
}

router.get("/dashboard/ozet", async (req, res) => {
  try {
    const { sirketId } = req.query as Record<string, string>;

    const fatRows = await db.select().from(faturalar);
    const odRows = await db.select().from(odemeler);
    const cariRows = await db.select().from(cariler);
    const planRows = await db.select().from(starlinkPlanlari).where(eq(starlinkPlanlari.aktif, true));
    const bankaRows = await db.select().from(bankaHesaplari);

    const filtrelenmisFaturalar = filtreleSirket(fatRows, req, sirketId);
    const filtrelenmisOdemeler = filtreleSirket(odRows, req, sirketId);
    const filtrelenmisCariler = filtreleSirket(cariRows, req, sirketId);
    const filtrelenmisPlanlari = filtreleSirket(planRows, req, sirketId);
    const filtrelenmisHesaplar = filtreleSirket(bankaRows, req, sirketId);

    if (!filtrelenmisFaturalar || !filtrelenmisOdemeler || !filtrelenmisCariler || !filtrelenmisPlanlari || !filtrelenmisHesaplar) {
      res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
      return;
    }

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

    const paraBirimleri = new Set(filtrelenmisFaturalar.map(f => f.paraBirimi));
    const paraBirimiOzetleri = Array.from(paraBirimleri).map(pb => {
      const fats = filtrelenmisFaturalar!.filter(f => f.paraBirimi === pb && (f.durum === "acik" || f.durum === "kismi_odendi"));
      const ods = filtrelenmisOdemeler!.filter(o => o.paraBirimi === pb && o.tip === "tahsilat");
      const alacak = fats.reduce((s, f) => s + Number(f.genelToplam), 0);
      const tahsilat = ods.reduce((s, o) => s + Number(o.tutar), 0);
      return { paraBirimi: pb, toplamAlacak: alacak, toplamTahsilat: tahsilat, kalanBakiye: alacak - tahsilat };
    });

    const bankaHesapBakiyeleri = await Promise.all(
      filtrelenmisHesaplar.map(async h => {
        const ods = await db.select().from(odemeler).where(eq(odemeler.bankaHesabiId, h.id));
        const bakiye = ods.reduce((s, o) => s + (o.tip === "tahsilat" ? Number(o.tutar) : -Number(o.tutar)), 0);
        return { hesapId: h.id, bankaAdi: h.bankaAdi, hesapAdi: h.hesapAdi, paraBirimi: h.paraBirimi, bakiye };
      })
    );

    res.json({
      toplamAlacak, toplamTahsilat, kalanBakiye: toplamAlacak - toplamTahsilat,
      toplamFaturaSayisi: filtrelenmisFaturalar.length, toplamOdemeSayisi: filtrelenmisOdemeler.length,
      toplamCariSayisi: filtrelenmisCariler.length, vadesGecmisFaturaSayisi: vadesGecmis,
      vadesYaklasiyor, paraBirimiOzetleri, bankaHesapBakiyeleri,
      aktifStarlinkPlanSayisi: filtrelenmisPlanlari.length,
    });
  } catch {
    res.status(500).json({ error: "Dashboard verisi alınamadı" });
  }
});

router.get("/dashboard/vadesi-yaklasan", async (req, res) => {
  try {
    const { sirketId, gun = "30" } = req.query as Record<string, string>;
    const today = new Date().toISOString().split("T")[0];
    const future = new Date(); future.setDate(future.getDate() + Number(gun));
    const futureStr = future.toISOString().split("T")[0];

    let rows = await db.select().from(faturalar)
      .where(or(eq(faturalar.durum, "acik"), eq(faturalar.durum, "kismi_odendi")));
    rows = rows.filter(f => f.vadeTarihi >= today && f.vadeTarihi <= futureStr);

    const scoped = filtreleSirket(rows, req, sirketId);
    if (!scoped) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }

    res.json(scoped.map(f => ({
      id: f.id, sirketId: f.sirketId, sirketAd: null,
      cariId: f.cariId, cariAd: null, gemiId: f.gemiId, gemiAd: null,
      faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
      paraBirimi: f.paraBirimi, durum: f.durum,
      toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
      genelToplam: Number(f.genelToplam), odenenTutar: 0, kalanTutar: Number(f.genelToplam),
      notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
    })));
  } catch {
    res.status(500).json({ error: "Vadesi yaklaşan faturalar alınamadı" });
  }
});

router.get("/dashboard/son-islemler", async (req, res) => {
  try {
    const { sirketId, limit = "10" } = req.query as Record<string, string>;
    const n = Number(limit);

    const allFats = await db.select().from(faturalar).orderBy(faturalar.olusturmaTarihi);
    const allOds = await db.select().from(odemeler).orderBy(odemeler.olusturmaTarihi);

    const scopedFats = filtreleSirket(allFats, req, sirketId);
    const scopedOds = filtreleSirket(allOds, req, sirketId);
    if (!scopedFats || !scopedOds) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }

    const sonFaturalar = scopedFats.slice(-n).reverse().map(f => ({
      id: f.id, sirketId: f.sirketId, sirketAd: null,
      cariId: f.cariId, cariAd: null, gemiId: f.gemiId, gemiAd: null,
      faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
      paraBirimi: f.paraBirimi, durum: f.durum,
      toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
      genelToplam: Number(f.genelToplam), odenenTutar: 0, kalanTutar: Number(f.genelToplam),
      notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
    }));

    const sonOdemeler = scopedOds.slice(-n).reverse().map(o => ({
      id: o.id, sirketId: o.sirketId, sirketAd: null,
      cariId: o.cariId, cariAd: null, gemiId: o.gemiId, gemiAd: null,
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
    const { sirketId, yil } = req.query as Record<string, string>;
    const hedefYil = Number(yil) || new Date().getFullYear();

    const allFats = await db.select().from(faturalar);
    const allOds = await db.select().from(odemeler).where(eq(odemeler.tip, "tahsilat"));

    const fats = filtreleSirket(allFats, req, sirketId);
    const ods = filtreleSirket(allOds, req, sirketId);
    if (!fats || !ods) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }

    const result = Array.from({ length: 12 }, (_, i) => {
      const ay = i + 1;
      const prefix = `${hedefYil}-${String(ay).padStart(2, "0")}`;
      const toplamFatura = fats.filter(f => f.faturaTarihi.startsWith(prefix)).reduce((s, f) => s + Number(f.genelToplam), 0);
      const toplamTahsilat = ods.filter(o => o.tarih.startsWith(prefix)).reduce((s, o) => s + Number(o.tutar), 0);
      return { yil: hedefYil, ay, ayAd: AY_ADLARI[i], toplamFatura, toplamTahsilat };
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: "Aylık gelir verisi alınamadı" });
  }
});

router.get("/dashboard/yenileme-uyarilari", async (req, res) => {
  try {
    const { sirketId, gun = "30" } = req.query as Record<string, string>;
    const today = new Date().toISOString().split("T")[0];
    const future = new Date(); future.setDate(future.getDate() + Number(gun));
    const futureStr = future.toISOString().split("T")[0];

    let rows = await db.select().from(starlinkPlanlari).where(eq(starlinkPlanlari.aktif, true));
    rows = rows.filter(p => p.bitisTarihi >= today && p.bitisTarihi <= futureStr);

    const scoped = filtreleSirket(rows, req, sirketId);
    if (!scoped) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }

    res.json(scoped.map(p => {
      const kalanGun = Math.ceil((new Date(p.bitisTarihi).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return {
        id: p.id, sirketId: p.sirketId, sirketAd: null,
        cariId: p.cariId, cariAd: null, gemiId: p.gemiId, gemiAd: null,
        planAdi: p.planAdi, hizMbps: p.hizMbps,
        baslangicTarihi: p.baslangicTarihi, bitisTarihi: p.bitisTarihi,
        aylikUcret: Number(p.aylikUcret), paraBirimi: p.paraBirimi,
        otomatikYenileme: p.otomatikYenileme, aktif: p.aktif,
        notlar: p.notlar, kalanGun, olusturmaTarihi: p.olusturmaTarihi,
      };
    }));
  } catch {
    res.status(500).json({ error: "Yenileme uyarıları alınamadı" });
  }
});

export default router;
