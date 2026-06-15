import { Router } from "express";
import { db } from "@workspace/db";
import { firmalar, gemiler, faturalar } from "@workspace/db";
import { sirketlerFiltrele } from "../middleware/auth";

const router = Router();

router.get("/arama", async (req, res) => {
  try {
    const { q, catiFirmaId } = req.query as Record<string, string>;
    if (!q || q.trim().length < 2) {
      res.json({ firmalar: [], gemiler: [], faturalar: [] }); return;
    }
    const term = q.trim().toLowerCase();

    const allFirmalar = await db.select().from(firmalar).orderBy(firmalar.ad);
    const allGemiler = await db.select().from(gemiler).orderBy(gemiler.ad);
    const allFaturalar = await db.select().from(faturalar).orderBy(faturalar.faturaTarihi);

    const { rows: scopedFirmalar } = sirketlerFiltrele(
      allFirmalar.map(f => ({ ...f, catiFirmaId: f.tip === "cati" ? f.id : (f.ustFirmaId ?? f.id) })),
      req, catiFirmaId
    );
    const izinliFirmaIds = new Set(scopedFirmalar.map(f => f.id));

    const filtFirmalar = allFirmalar.filter(f =>
      izinliFirmaIds.has(f.id) &&
      (f.ad.toLowerCase().includes(term) ||
       (f.vergiNo ?? "").toLowerCase().includes(term) ||
       (f.eposta ?? "").toLowerCase().includes(term))
    ).slice(0, 5);

    const filtGemiler = allGemiler.filter(g =>
      izinliFirmaIds.has(g.firmaId) &&
      (g.ad.toLowerCase().includes(term) ||
       (g.imoNumarasi ?? "").toLowerCase().includes(term))
    ).slice(0, 5);

    const { rows: scopedFat } = sirketlerFiltrele(
      allFaturalar.map(f => ({ ...f })), req, catiFirmaId
    );
    const scopedFatIds = new Set(scopedFat.map(f => f.id));

    const filtFaturalar = allFaturalar.filter(f =>
      scopedFatIds.has(f.id) &&
      (f.faturaNo.toLowerCase().includes(term) ||
       (f.aciklama ?? "").toLowerCase().includes(term) ||
       (f.notlar ?? "").toLowerCase().includes(term))
    ).slice(0, 5);

    const faturaAdMap: Record<number, string> = {};
    for (const f of allFirmalar) faturaAdMap[f.id] = f.ad;

    res.json({
      firmalar: filtFirmalar.map(f => ({
        id: f.id, tip: f.tip, ustFirmaId: f.ustFirmaId,
        ad: f.ad, vergiNo: f.vergiNo, vergiDairesi: f.vergiDairesi,
        adres: f.adres, telefon: f.telefon, eposta: f.eposta,
        paraBirimi: f.paraBirimi, notlar: f.notlar, seriOneki: f.seriOneki,
        logoUrl: f.logo, aktif: f.aktif, olusturmaTarihi: f.olusturmaTarihi,
        yetkiliKisi: f.yetkiliKisi,
      })),
      gemiler: filtGemiler.map(g => ({
        id: g.id, firmaId: g.firmaId, catiFirmaId: g.firmaId,
        ad: g.ad, imoNumarasi: g.imoNumarasi, bayrakDevleti: g.bayrakDevleti,
        notlar: g.notlar, aktif: g.aktif, olusturmaTarihi: g.olusturmaTarihi,
        firmaAd: faturaAdMap[g.firmaId] ?? null,
      })),
      faturalar: filtFaturalar.map(f => ({
        id: f.id, catiFirmaId: f.catiFirmaId,
        catiFirmaAd: faturaAdMap[f.catiFirmaId] ?? null,
        bagliFirmaId: f.bagliFirmaId,
        bagliFirmaAd: faturaAdMap[f.bagliFirmaId] ?? null,
        gemiId: f.gemiId, gemiAd: null,
        faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
        paraBirimi: f.paraBirimi, durum: f.durum,
        toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
        genelToplam: Number(f.genelToplam), odenenTutar: 0, kalanTutar: Number(f.genelToplam),
        notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
      })),
    });
  } catch {
    res.status(500).json({ error: "Arama başarısız" });
  }
});

export default router;
