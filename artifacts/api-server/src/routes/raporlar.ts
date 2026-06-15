import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, sirketler, cariler, gemiler } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sirketErisimKontrol } from "../middleware/auth";

const router = Router();

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const header = Object.keys(rows[0]).join(",");
  const lines = rows.map(r =>
    Object.values(r).map(v =>
      typeof v === "string" && (v.includes(",") || v.includes('"'))
        ? `"${v.replace(/"/g, '""')}"`
        : String(v ?? "")
    ).join(",")
  );
  return [header, ...lines].join("\n");
}

router.get("/raporlar/kdv-ozeti", async (req, res) => {
  try {
    const { sirketId, yil, ay, format } = req.query as Record<string, string>;

    if (sirketId && !sirketErisimKontrol(Number(sirketId), req)) {
      res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
      return;
    }

    let fats = await db.select().from(faturalar).where(eq(faturalar.durum, "odendi"));

    if (sirketId) {
      fats = fats.filter(f => f.sirketId === Number(sirketId));
    } else {
      const izinli = req.izinliSirketler ?? [];
      if (req.kullanici?.rol !== "yonetici") {
        fats = fats.filter(f => izinli.includes(f.sirketId));
      }
    }
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

    const sirketKirilim = Object.values(sirketMap).filter(s => s.kdvDahil > 0);

    if (format === "csv") {
      const csvRows = [
        { Rapor: "KDV Özeti", Yil: yil ?? "Tümü", Ay: ay ?? "Tümü" },
        ...fats.map(f => ({
          FaturaNo: f.faturaNo,
          FaturaTarihi: f.faturaTarihi,
          ParaBirimi: f.paraBirimi,
          KDVHaricTutar: Number(f.toplamTutar).toFixed(2),
          KDVTutari: Number(f.kdvTutari).toFixed(2),
          GenelToplam: Number(f.genelToplam).toFixed(2),
        })),
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="kdv-ozeti-${yil ?? "tumumu"}.csv"`);
      res.send(toCsv(csvRows));
      return;
    }

    res.json({
      kdvHaricToplam, kdvTutariToplam, kdvDahilToplam,
      paraBirimiKirilim: Object.entries(pbMap).map(([pb, v]) => ({ paraBirimi: pb, ...v })),
      sirketKirilim,
    });
  } catch (err) {
    res.status(500).json({ error: "KDV özeti alınamadı" });
  }
});

router.get("/raporlar/alacak-yaslandirma", async (req, res) => {
  try {
    const { sirketId, format } = req.query as Record<string, string>;
    const today = new Date();

    if (sirketId && !sirketErisimKontrol(Number(sirketId), req)) {
      res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
      return;
    }

    let fats = await db
      .select({ f: faturalar, cariAd: cariler.ad, gemiAd: gemiler.ad, sirketAd: sirketler.ad })
      .from(faturalar)
      .leftJoin(cariler, eq(faturalar.cariId, cariler.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .leftJoin(sirketler, eq(faturalar.sirketId, sirketler.id));

    const acikFaturalar = fats.filter(r => r.f.durum === "acik" || r.f.durum === "kismi_odendi");

    let filtrelenmis = acikFaturalar;
    if (sirketId) {
      filtrelenmis = filtrelenmis.filter(r => r.f.sirketId === Number(sirketId));
    } else if (req.kullanici?.rol !== "yonetici") {
      const izinli = req.izinliSirketler ?? [];
      filtrelenmis = filtrelenmis.filter(r => izinli.includes(r.f.sirketId));
    }

    const dilimler = [
      { etiket: "0-30 Gün", min: 0, max: 30 },
      { etiket: "31-60 Gün", min: 31, max: 60 },
      { etiket: "61-90 Gün", min: 61, max: 90 },
      { etiket: "91+ Gün", min: 91, max: Infinity },
    ];

    const result = dilimler.map(d => {
      const dilimFaturalar = filtrelenmis.filter(r => {
        const gun = Math.ceil((today.getTime() - new Date(r.f.vadeTarihi).getTime()) / (1000 * 60 * 60 * 24));
        return gun >= d.min && gun <= d.max;
      });
      return {
        etiket: d.etiket,
        toplamTutar: dilimFaturalar.reduce((s, r) => s + Number(r.f.genelToplam), 0),
        faturaSayisi: dilimFaturalar.length,
        faturalar: dilimFaturalar.map(r => ({
          id: r.f.id, sirketId: r.f.sirketId, sirketAd: r.sirketAd,
          cariId: r.f.cariId, cariAd: r.cariAd, gemiId: r.f.gemiId, gemiAd: r.gemiAd,
          faturaNo: r.f.faturaNo, faturaTarihi: r.f.faturaTarihi, vadeTarihi: r.f.vadeTarihi,
          paraBirimi: r.f.paraBirimi, durum: r.f.durum,
          toplamTutar: Number(r.f.toplamTutar), kdvTutari: Number(r.f.kdvTutari),
          genelToplam: Number(r.f.genelToplam), odenenTutar: 0, kalanTutar: Number(r.f.genelToplam),
          notlar: r.f.notlar, aciklama: r.f.aciklama, olusturmaTarihi: r.f.olusturmaTarihi,
        })),
      };
    });

    if (format === "csv") {
      const allFats = result.flatMap(d => d.faturalar.map(f => ({ Dilim: d.etiket, ...f })));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="alacak-yaslandirma.csv"');
      res.send(toCsv(allFats));
      return;
    }

    res.json({ dilimler: result });
  } catch (err) {
    res.status(500).json({ error: "Alacak yaşlandırma raporu alınamadı" });
  }
});

export default router;
