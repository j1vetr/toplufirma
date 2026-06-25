import { Router } from "express";
import { db } from "@workspace/db";
import { gonderiGecmisi, faturalar, teklifler, firmalar } from "@workspace/db";
import { eq, and, gte, lte, ilike, sql, or } from "drizzle-orm";
import { sirketErisimKontrol } from "../middleware/auth";
import { alias } from "drizzle-orm/pg-core";

const router = Router();

router.get("/gonderi-gecmisi", async (req, res) => {
  try {
    const { catiFirmaId, baslangicTarihi, bitisTarihi, kayitTipi, aliciEposta } = req.query as Record<string, string | undefined>;

    const catiFirmaFaturalar = alias(firmalar, "cati_firma_faturalar");
    const catiFirmaTeklifler = alias(firmalar, "cati_firma_teklifler");

    const rows = await db
      .select({
        id: gonderiGecmisi.id,
        kayitTipi: gonderiGecmisi.kayitTipi,
        kayitId: gonderiGecmisi.kayitId,
        aliciEposta: gonderiGecmisi.aliciEposta,
        gonderenAd: gonderiGecmisi.gonderenAd,
        gonderilmeTarihi: gonderiGecmisi.gonderilmeTarihi,
        kayitNo: sql<string>`COALESCE(${faturalar.faturaNo}, ${teklifler.teklifNo})`,
        catiFirmaId: sql<number>`COALESCE(${faturalar.catiFirmaId}, ${teklifler.catiFirmaId})`,
        catiFirmaAd: sql<string>`COALESCE(${catiFirmaFaturalar.ad}, ${catiFirmaTeklifler.ad})`,
      })
      .from(gonderiGecmisi)
      .leftJoin(faturalar, and(eq(gonderiGecmisi.kayitTipi, "fatura"), eq(gonderiGecmisi.kayitId, faturalar.id)))
      .leftJoin(teklifler, and(eq(gonderiGecmisi.kayitTipi, "teklif"), eq(gonderiGecmisi.kayitId, teklifler.id)))
      .leftJoin(catiFirmaFaturalar, eq(faturalar.catiFirmaId, catiFirmaFaturalar.id))
      .leftJoin(catiFirmaTeklifler, eq(teklifler.catiFirmaId, catiFirmaTeklifler.id))
      .orderBy(sql`${gonderiGecmisi.gonderilmeTarihi} DESC`);

    let filtered = rows.filter(r => {
      if (!r.catiFirmaId) return false;
      return sirketErisimKontrol(r.catiFirmaId, req);
    });

    if (catiFirmaId) {
      const id = Number(catiFirmaId);
      filtered = filtered.filter(r => r.catiFirmaId === id);
    }

    if (kayitTipi && kayitTipi !== "tumu") {
      filtered = filtered.filter(r => r.kayitTipi === kayitTipi);
    }

    if (aliciEposta) {
      const q = aliciEposta.toLowerCase();
      filtered = filtered.filter(r => r.aliciEposta.toLowerCase().includes(q));
    }

    if (baslangicTarihi) {
      const start = new Date(baslangicTarihi);
      filtered = filtered.filter(r => new Date(r.gonderilmeTarihi) >= start);
    }

    if (bitisTarihi) {
      const end = new Date(bitisTarihi);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => new Date(r.gonderilmeTarihi) <= end);
    }

    res.json(filtered.map(r => ({
      id: r.id,
      kayitTipi: r.kayitTipi,
      kayitId: r.kayitId,
      kayitNo: r.kayitNo,
      aliciEposta: r.aliciEposta,
      gonderenAd: r.gonderenAd,
      gonderilmeTarihi: r.gonderilmeTarihi,
      catiFirmaId: r.catiFirmaId,
      catiFirmaAd: r.catiFirmaAd,
    })));
  } catch (err) {
    console.error("[gonderi-gecmisi] error:", err);
    res.status(500).json({ error: "Gönderim geçmişi alınamadı" });
  }
});

export default router;
