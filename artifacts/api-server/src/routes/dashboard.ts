import { Router } from "express";
import { db } from "@workspace/db";
import {
  faturalar, odemeler, cariler, starlinkPlanlari, bankaHesaplari, sirketler
} from "@workspace/db/schema";
import { eq, sql, and, or, gte, lte } from "drizzle-orm";

const router = Router();

const AY_ADLARI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

router.get("/dashboard/ozet", async (req, res) => {
  try {
    const { sirketId } = req.query as Record<string, string>;

    const fatRows = await db.select().from(faturalar);
    const odRows = await db.select().from(odemeler);
    const cariRows = await db.select().from(cariler);
    const planRows = await db.select().from(starlinkPlanlari).where(eq(starlinkPlanlari.aktif, true));
    const bankaRows = await db.select().from(bankaHesaplari);

    const filtrele = (sirketId: string | undefined) => (r: { sirketId: number }) =>
      sirketId ? r.sirketId === Number(sirketId) : true;

    const filtrelenmisFaturalar = fatRows.filter(filtrele(sirketId));
    const filtrelenmisOdemeler = odRows.filter(filtrele(sirketId));
    const filtrelenmisCariler = cariRows.filter(sirketId ? (c) => c.sirketId === Number(sirketId) : () => true);
    const filtrelenmisPlanlari = planRows.filter(filtrele(sirketId));
    const filtrelenmisHesaplar = bankaRows.filter(filtrele(sirketId));

    const today = new Date().toISOString().split("T")[0];
    const vadesGecmis = filtrelenmisFaturalar.filter(f =>
      f.vadeTarihi < today && (f.durum === "acik" || f.durum === "kismi_odendi")
    ).length;

    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().split("T")[0];
    const vadesYaklasiyor = filtrelenmisFaturalar.filter(f =>
      f.vadeTarihi >= today && f.vadeTarihi <= in30Str && (f.durum === "acik" || f.durum === "kismi_odendi")
    ).length;

    const toplamAlacak = filtrelenmisFaturalar
      .filter(f => f.durum === "acik" || f.durum === "kismi_odendi")
      .reduce((s, f) => s + Number(f.genelToplam), 0);

    const toplamTahsilat = filtrelenmisOdemeler
      .filter(o => o.tip === "tahsilat")
      .reduce((s, o) => s + Number(o.tutar), 0);

    const paraBirimleri = new Set([...filtrelenmisFaturalar.map(f => f.paraBirimi)]);
    const paraBirimiOzetleri = Array.from(paraBirimleri).map(pb => {
      const fats = filtrelenmisFaturalar.filter(f => f.paraBirimi === pb && (f.durum === "acik" || f.durum === "kismi_odendi"));
      const ods = filtrelenmisOdemeler.filter(o => o.paraBirimi === pb && o.tip === "tahsilat");
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
      toplamAlacak,
      toplamTahsilat,
      kalanBakiye: toplamAlacak - toplamTahsilat,
      toplamFaturaSayisi: filtrelenmisFaturalar.length,
      toplamOdemeSayisi: filtrelenmisOdemeler.length,
      toplamCariSayisi: filtrelenmisCariler.length,
      vadesGecmisFaturaSayisi: vadesGecmis,
      vadesYaklasiyor,
      paraBirimiOzetleri,
      bankaHesapBakiyeleri,
      aktifStarlinkPlanSayisi: filtrelenmisPlanlari.length,
    });
  } catch (err) {
    res.status(500).json({ error: "Dashboard verisi alınamadı" });
  }
});

router.get("/dashboard/vadesi-yaklasan", async (req, res) => {
  try {
    const { sirketId, gun = "30" } = req.query as Record<string, string>;
    const today = new Date().toISOString().split("T")[0];
    const future = new Date();
    future.setDate(future.getDate() + Number(gun));
    const futureStr = future.toISOString().split("T")[0];

    let rows = await db.select().from(faturalar)
      .where(or(eq(faturalar.durum, "acik"), eq(faturalar.durum, "kismi_odendi")));

    rows = rows.filter(f => f.vadeTarihi >= today && f.vadeTarihi <= futureStr);
    if (sirketId) rows = rows.filter(f => f.sirketId === Number(sirketId));

    res.json(rows.map(f => ({
      id: f.id, sirketId: f.sirketId, sirketAd: null,
      cariId: f.cariId, cariAd: null, gemiId: f.gemiId, gemiAd: null,
      faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
      paraBirimi: f.paraBirimi, durum: f.durum,
      toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
      genelToplam: Number(f.genelToplam), odenenTutar: 0, kalanTutar: Number(f.genelToplam),
      notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
    })));
  } catch (err) {
    res.status(500).json({ error: "Vadesi yaklaşan faturalar alınamadı" });
  }
});

router.get("/dashboard/son-islemler", async (req, res) => {
  try {
    const { sirketId, limit = "10" } = req.query as Record<string, string>;
    const n = Number(limit);

    let fats = await db.select().from(faturalar).orderBy(faturalar.olusturmaTarihi);
    let ods = await db.select().from(odemeler).orderBy(odemeler.olusturmaTarihi);

    if (sirketId) {
      fats = fats.filter(f => f.sirketId === Number(sirketId));
      ods = ods.filter(o => o.sirketId === Number(sirketId));
    }

    const sonFaturalar = fats.slice(-n).reverse().map(f => ({
      id: f.id, sirketId: f.sirketId, sirketAd: null,
      cariId: f.cariId, cariAd: null, gemiId: f.gemiId, gemiAd: null,
      faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
      paraBirimi: f.paraBirimi, durum: f.durum,
      toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
      genelToplam: Number(f.genelToplam), odenenTutar: 0, kalanTutar: Number(f.genelToplam),
      notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
    }));

    const sonOdemeler = ods.slice(-n).reverse().map(o => ({
      id: o.id, sirketId: o.sirketId, sirketAd: null,
      cariId: o.cariId, cariAd: null, gemiId: o.gemiId, gemiAd: null,
      bankaHesabiId: o.bankaHesabiId, bankaHesabiAd: null,
      faturaId: o.faturaId, faturaNo: null, tip: o.tip, tarih: o.tarih,
      tutar: Number(o.tutar), paraBirimi: o.paraBirimi,
      odemeYontemi: o.odemeYontemi, aciklama: o.aciklama,
      olusturmaTarihi: o.olusturmaTarihi,
    }));

    res.json({ sonFaturalar, sonOdemeler });
  } catch (err) {
    res.status(500).json({ error: "Son işlemler alınamadı" });
  }
});

router.get("/dashboard/aylik-gelir", async (req, res) => {
  try {
    const { sirketId, yil } = req.query as Record<string, string>;
    const hedefYil = Number(yil) || new Date().getFullYear();

    let fats = await db.select().from(faturalar);
    let ods = await db.select().from(odemeler).where(eq(odemeler.tip, "tahsilat"));

    if (sirketId) {
      fats = fats.filter(f => f.sirketId === Number(sirketId));
      ods = ods.filter(o => o.sirketId === Number(sirketId));
    }

    const result = Array.from({ length: 12 }, (_, i) => {
      const ay = i + 1;
      const ayStr = String(ay).padStart(2, "0");
      const prefix = `${hedefYil}-${ayStr}`;

      const toplamFatura = fats
        .filter(f => f.faturaTarihi.startsWith(prefix))
        .reduce((s, f) => s + Number(f.genelToplam), 0);

      const toplamTahsilat = ods
        .filter(o => o.tarih.startsWith(prefix))
        .reduce((s, o) => s + Number(o.tutar), 0);

      return { yil: hedefYil, ay, ayAd: AY_ADLARI[i], toplamFatura, toplamTahsilat };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Aylık gelir verisi alınamadı" });
  }
});

router.get("/dashboard/yenileme-uyarilari", async (req, res) => {
  try {
    const { sirketId, gun = "30" } = req.query as Record<string, string>;
    const today = new Date().toISOString().split("T")[0];
    const future = new Date();
    future.setDate(future.getDate() + Number(gun));
    const futureStr = future.toISOString().split("T")[0];

    let rows = await db.select().from(starlinkPlanlari).where(eq(starlinkPlanlari.aktif, true));
    rows = rows.filter(p => p.bitisTarihi >= today && p.bitisTarihi <= futureStr);
    if (sirketId) rows = rows.filter(p => p.sirketId === Number(sirketId));

    res.json(rows.map(p => {
      const bitis = new Date(p.bitisTarihi);
      const kalanGun = Math.ceil((bitis.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
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
  } catch (err) {
    res.status(500).json({ error: "Yenileme uyarıları alınamadı" });
  }
});

export default router;
