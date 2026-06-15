import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, faturaKalemleri, sirketler } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

router.get("/raporlar/kdv-ozeti", async (req, res) => {
  try {
    const { sirketId, yil, ay } = req.query as Record<string, string>;

    let fats = await db.select().from(faturalar).where(
      eq(faturalar.durum, "odendi")
    );

    if (sirketId) fats = fats.filter(f => f.sirketId === Number(sirketId));
    if (yil) fats = fats.filter(f => f.faturaTarihi.startsWith(String(yil)));
    if (ay) {
      const ayStr = String(ay).padStart(2, "0");
      fats = fats.filter(f => f.faturaTarihi.includes(`-${ayStr}-`));
    }

    const kdvHaricToplam = fats.reduce((s, f) => s + Number(f.toplamTutar), 0);
    const kdvTutariToplam = fats.reduce((s, f) => s + Number(f.kdvTutari), 0);
    const kdvDahilToplam = fats.reduce((s, f) => s + Number(f.genelToplam), 0);

    const pbMap: Record<string, { kdvHaric: number; kdvTutari: number; kdvDahil: number }> = {};
    for (const f of fats) {
      if (!pbMap[f.paraBirimi]) pbMap[f.paraBirimi] = { kdvHaric: 0, kdvTutari: 0, kdvDahil: 0 };
      pbMap[f.paraBirimi].kdvHaric += Number(f.toplamTutar);
      pbMap[f.paraBirimi].kdvTutari += Number(f.kdvTutari);
      pbMap[f.paraBirimi].kdvDahil += Number(f.genelToplam);
    }

    const sirketMap: Record<number, { sirketId: number; sirketAd: string; kdvHaric: number; kdvTutari: number; kdvDahil: number }> = {};
    const sirketRows = await db.select().from(sirketler);
    for (const s of sirketRows) {
      sirketMap[s.id] = { sirketId: s.id, sirketAd: s.ad, kdvHaric: 0, kdvTutari: 0, kdvDahil: 0 };
    }
    for (const f of fats) {
      if (!sirketMap[f.sirketId]) sirketMap[f.sirketId] = { sirketId: f.sirketId, sirketAd: "", kdvHaric: 0, kdvTutari: 0, kdvDahil: 0 };
      sirketMap[f.sirketId].kdvHaric += Number(f.toplamTutar);
      sirketMap[f.sirketId].kdvTutari += Number(f.kdvTutari);
      sirketMap[f.sirketId].kdvDahil += Number(f.genelToplam);
    }

    res.json({
      kdvHaricToplam,
      kdvTutariToplam,
      kdvDahilToplam,
      paraBirimiKirilim: Object.entries(pbMap).map(([pb, v]) => ({ paraBirimi: pb, ...v })),
      sirketKirilim: Object.values(sirketMap).filter(s => s.kdvDahil > 0),
    });
  } catch (err) {
    res.status(500).json({ error: "KDV özeti alınamadı" });
  }
});

router.get("/raporlar/alacak-yaslandirma", async (req, res) => {
  try {
    const { sirketId } = req.query as Record<string, string>;
    const today = new Date();

    let fats = await db.select().from(faturalar);
    fats = fats.filter(f => f.durum === "acik" || f.durum === "kismi_odendi");
    if (sirketId) fats = fats.filter(f => f.sirketId === Number(sirketId));

    const dilimler = [
      { etiket: "0-30 Gün", min: 0, max: 30 },
      { etiket: "31-60 Gün", min: 31, max: 60 },
      { etiket: "61-90 Gün", min: 61, max: 90 },
      { etiket: "91+ Gün", min: 91, max: Infinity },
    ];

    const result = dilimler.map(d => {
      const dilimFaturalar = fats.filter(f => {
        const gun = Math.ceil((today.getTime() - new Date(f.vadeTarihi).getTime()) / (1000 * 60 * 60 * 24));
        return gun >= d.min && gun <= d.max;
      });
      return {
        etiket: d.etiket,
        toplamTutar: dilimFaturalar.reduce((s, f) => s + Number(f.genelToplam), 0),
        faturaSayisi: dilimFaturalar.length,
        faturalar: dilimFaturalar.map(f => ({
          id: f.id, sirketId: f.sirketId, sirketAd: null,
          cariId: f.cariId, cariAd: null, gemiId: f.gemiId, gemiAd: null,
          faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
          paraBirimi: f.paraBirimi, durum: f.durum,
          toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
          genelToplam: Number(f.genelToplam), odenenTutar: 0, kalanTutar: Number(f.genelToplam),
          notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
        })),
      };
    });

    res.json({ dilimler: result });
  } catch (err) {
    res.status(500).json({ error: "Alacak yaşlandırma raporu alınamadı" });
  }
});

export default router;
