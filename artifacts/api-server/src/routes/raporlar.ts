import { Router, type Request, type Response } from "express";
import { db, faturalar, firmalar, gemiler, odemeler } from "@workspace/db";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { GetFinansalRaporQueryParams, GetFinansalRaporResponse, type FinansalRapor } from "@workspace/api-zod";
import { sirketErisimKontrol } from "../middleware/auth";
import { faturaOdenenMap } from "../utils/faturaTahsilat";
import { finansalRaporHesapla } from "../utils/finansalRapor";

const router = Router();
const cati = alias(firmalar, "rapor_cati");

async function raporuAl(req: Request, res: Response): Promise<FinansalRapor | null> {
  const parsed = GetFinansalRaporQueryParams.safeParse(req.query);
  if (!parsed.success || ["catiFirmaId", "yil", "ay"].some(key =>
    req.query[key] != null && (!Number.isInteger(Number(req.query[key])) || Array.isArray(req.query[key])))) {
    res.status(400).json({ error: "Rapor filtreleri geçersiz" }); return null;
  }
  const { catiFirmaId, yil, ay, paraBirimi } = parsed.data;
  if (catiFirmaId && !sirketErisimKontrol(catiFirmaId, req)) {
    res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return null;
  }
  const izinli = req.kullanici?.rol === "yonetici" ? undefined : req.izinliSirketler ?? [];
  const fatScope = catiFirmaId ? eq(faturalar.catiFirmaId, catiFirmaId)
    : izinli ? inArray(faturalar.catiFirmaId, izinli) : undefined;
  const cashScope = catiFirmaId ? eq(odemeler.catiFirmaId, catiFirmaId)
    : izinli ? inArray(odemeler.catiFirmaId, izinli) : undefined;
  // All sections see the same database snapshot during concurrent payments.
  return db.transaction(async tx => {
    const invoices = await tx.select({
      f: faturalar, catiFirmaAd: cati.ad, bagliFirmaAd: firmalar.ad,
      gemiAd: gemiler.ad, gemiImo: gemiler.imoNumarasi,
    }).from(faturalar)
      .leftJoin(cati, eq(faturalar.catiFirmaId, cati.id))
      .leftJoin(firmalar, eq(faturalar.bagliFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .where(and(fatScope, notInArray(faturalar.durum, ["taslak", "iptal"])));
    const cash = await tx.select({
      tarih: odemeler.tarih, tip: odemeler.tip, tutar: odemeler.tutar, paraBirimi: odemeler.paraBirimi,
    }).from(odemeler).where(cashScope);
    const paid = await faturaOdenenMap(invoices.map(r => r.f), tx);
    return GetFinansalRaporResponse.parse(finansalRaporHesapla(
      invoices, cash, paid, { yil: yil ?? new Date().getFullYear(), ay, paraBirimi },
    ));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

function csv(rows: object[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + (rows.length ? [
    Object.keys(rows[0]).map(cell).join(","),
    ...rows.map(row => Object.values(row).map(cell).join(",")),
  ].join("\r\n") : "");
}

type Legacy = "kdv-ozeti" | "alacak-yaslandirma" | "gemi-gelir" | "fatura-ozeti" | "bagli-firma-analiz";
function eskiRapor(r: FinansalRapor, tur: Legacy) {
  if (tur === "kdv-ozeti") return r.kdv;
  if (tur === "alacak-yaslandirma") return {
    dilimler: r.yaslandirma.map(d => ({ etiket: d.etiket, toplamTutar: d.kalan, faturaSayisi: d.faturaSayisi, faturalar: d.faturalar })),
  };
  if (tur === "gemi-gelir") return {
    gemiler: r.gemiler.map(g => ({ gemiId: g.id, gemiAd: g.ad, gemiImo: g.imo,
      toplamFatura: g.faturalanan, toplamTahsilat: g.karsilanan, kalanTutar: g.kalan, faturaSayisi: g.faturaSayisi })),
  };
  if (tur === "bagli-firma-analiz") return {
    firmalar: r.musteriler.map(f => ({ bagliFirmaId: f.id, bagliFirmaAd: f.ad,
      toplamFatura: f.faturalanan, toplamTahsilat: f.karsilanan, acikFatura: f.kalan, faturaSayisi: f.faturaSayisi })),
  };
  return {
    toplamFatura: r.ozet.toplamFatura, toplamTahsilat: r.ozet.faturayaSayilan, toplamAcik: r.ozet.kalanAlacak,
    nakitTahsilat: r.ozet.nakitTahsilat, faturaSayisi: r.ozet.faturaSayisi, durumlar: r.durumlar,
    aylik: r.aylik.map(a => ({ ay: a.ay, ayAd: a.ayAd, sayi: a.sayi, tutar: a.faturalanan, odendi: a.faturayaSayilan, tahsilat: a.tahsilat })),
  };
}

router.get("/raporlar/finansal-ozet", async (req, res): Promise<void> => {
  try {
    const rapor = await raporuAl(req, res);
    if (rapor) res.json(rapor);
  } catch (error) {
    req.log.error({ err: error }, "Finansal rapor alınamadı");
    res.status(500).json({ error: "Finansal rapor alınamadı" });
  }
});

// Keep existing report URLs functional, backed by the same accounting rules.
for (const tur of ["kdv-ozeti", "alacak-yaslandirma", "gemi-gelir", "fatura-ozeti", "bagli-firma-analiz"] as const) {
  router.get(`/raporlar/${tur}`, async (req, res): Promise<void> => {
    try {
      const rapor = await raporuAl(req, res);
      if (!rapor) return;
      if (req.query.format === "csv") {
        const rows = tur === "alacak-yaslandirma"
          ? rapor.yaslandirma.flatMap(d => d.faturalar.map(f => ({ Dilim: d.etiket, ...f })))
          : rapor.faturalar;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${tur}-${rapor.yil}-${rapor.paraBirimi}.csv"`);
        res.send(csv(rows)); return;
      }
      res.json({ ...eskiRapor(rapor, tur), paraBirimi: rapor.paraBirimi, paraBirimleri: rapor.paraBirimleri });
    } catch (error) {
      req.log.error({ err: error, rapor: tur }, "Rapor alınamadı");
      res.status(500).json({ error: "Rapor alınamadı" });
    }
  });
}
export default router;
