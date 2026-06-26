import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, firmalar, gemiler, odemeler } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { sirketErisimKontrol } from "../middleware/auth";

const AY_ADLARI = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

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
    const { catiFirmaId, yil, ay, format } = req.query as Record<string, string>;

    if (catiFirmaId && !sirketErisimKontrol(Number(catiFirmaId), req)) {
      res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return;
    }

    let fats = await db.select().from(faturalar).where(eq(faturalar.durum, "odendi"));

    if (catiFirmaId) {
      fats = fats.filter(f => f.catiFirmaId === Number(catiFirmaId));
    } else {
      const izinli = req.izinliSirketler ?? [];
      if (req.kullanici?.rol !== "yonetici") fats = fats.filter(f => izinli.includes(f.catiFirmaId));
    }
    if (yil) fats = fats.filter(f => f.faturaTarihi.startsWith(String(yil)));
    if (ay) { const ayStr = String(ay).padStart(2, "0"); fats = fats.filter(f => f.faturaTarihi.includes(`-${ayStr}-`)); }

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

    const catiFirmaRows = await db.select().from(firmalar).where(eq(firmalar.tip, "cati"));
    const firmaMap: Record<number, { catiFirmaId: number; catiFirmaAd: string; kdvHaric: number; kdvTutari: number; kdvDahil: number }> = {};
    for (const s of catiFirmaRows) { firmaMap[s.id] = { catiFirmaId: s.id, catiFirmaAd: s.ad, kdvHaric: 0, kdvTutari: 0, kdvDahil: 0 }; }
    for (const f of fats) {
      if (!firmaMap[f.catiFirmaId]) firmaMap[f.catiFirmaId] = { catiFirmaId: f.catiFirmaId, catiFirmaAd: "", kdvHaric: 0, kdvTutari: 0, kdvDahil: 0 };
      firmaMap[f.catiFirmaId].kdvHaric += Number(f.toplamTutar);
      firmaMap[f.catiFirmaId].kdvTutari += Number(f.kdvTutari);
      firmaMap[f.catiFirmaId].kdvDahil += Number(f.genelToplam);
    }
    const firmaKirilim = Object.values(firmaMap).filter(s => s.kdvDahil > 0);

    if (format === "csv") {
      const csvRows = [
        { Rapor: "KDV Özeti", Yil: yil ?? "Tümü", Ay: ay ?? "Tümü" },
        ...fats.map(f => ({
          FaturaNo: f.faturaNo, FaturaTarihi: f.faturaTarihi, ParaBirimi: f.paraBirimi,
          KDVHaricTutar: Number(f.toplamTutar).toFixed(2),
          KDVTutari: Number(f.kdvTutari).toFixed(2),
          GenelToplam: Number(f.genelToplam).toFixed(2),
        })),
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="kdv-ozeti-${yil ?? "tumu"}.csv"`);
      res.send(toCsv(csvRows)); return;
    }

    res.json({
      kdvHaricToplam, kdvTutariToplam, kdvDahilToplam,
      paraBirimiKirilim: Object.entries(pbMap).map(([pb, v]) => ({ paraBirimi: pb, ...v })),
      firmaKirilim,
    });
  } catch {
    res.status(500).json({ error: "KDV özeti alınamadı" });
  }
});

router.get("/raporlar/alacak-yaslandirma", async (req, res) => {
  try {
    const { catiFirmaId, format } = req.query as Record<string, string>;
    const today = new Date();

    if (catiFirmaId && !sirketErisimKontrol(Number(catiFirmaId), req)) {
      res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return;
    }

    const allFats = await db
      .select({
        f: faturalar,
        bagliFirmaAd: firmalar.ad,
        gemiAd: gemiler.ad,
      })
      .from(faturalar)
      .leftJoin(firmalar, eq(faturalar.bagliFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id));

    const catiFirmaRows = await db.select({ id: firmalar.id, ad: firmalar.ad }).from(firmalar).where(eq(firmalar.tip, "cati"));
    const catiFirmaAdMap: Record<number, string> = {};
    for (const f of catiFirmaRows) catiFirmaAdMap[f.id] = f.ad;

    let acikFaturalar = allFats.filter(r => r.f.durum === "acik" || r.f.durum === "kismi_odendi");

    if (catiFirmaId) {
      acikFaturalar = acikFaturalar.filter(r => r.f.catiFirmaId === Number(catiFirmaId));
    } else if (req.kullanici?.rol !== "yonetici") {
      const izinli = req.izinliSirketler ?? [];
      acikFaturalar = acikFaturalar.filter(r => izinli.includes(r.f.catiFirmaId));
    }

    const dilimler = [
      { etiket: "0-30 Gün", min: 0, max: 30 },
      { etiket: "31-60 Gün", min: 31, max: 60 },
      { etiket: "61-90 Gün", min: 61, max: 90 },
      { etiket: "91+ Gün", min: 91, max: Infinity },
    ];

    const result = dilimler.map(d => {
      const dilimFaturalar = acikFaturalar.filter(r => {
        const gun = Math.ceil((today.getTime() - new Date(r.f.vadeTarihi).getTime()) / (1000 * 60 * 60 * 24));
        return gun >= d.min && gun <= d.max;
      });
      return {
        etiket: d.etiket,
        toplamTutar: dilimFaturalar.reduce((s, r) => s + Number(r.f.genelToplam), 0),
        faturaSayisi: dilimFaturalar.length,
        faturalar: dilimFaturalar.map(r => ({
          id: r.f.id, catiFirmaId: r.f.catiFirmaId, catiFirmaAd: catiFirmaAdMap[r.f.catiFirmaId] ?? null,
          bagliFirmaId: r.f.bagliFirmaId, bagliFirmaAd: r.bagliFirmaAd,
          gemiId: r.f.gemiId, gemiAd: r.gemiAd,
          faturaNo: r.f.faturaNo, faturaTarihi: r.f.faturaTarihi, vadeTarihi: r.f.vadeTarihi,
          paraBirimi: r.f.paraBirimi, durum: r.f.durum,
          toplamTutar: Number(r.f.toplamTutar), kdvTutari: Number(r.f.kdvTutari),
          genelToplam: Number(r.f.genelToplam), odenenTutar: 0, kalanTutar: Number(r.f.genelToplam),
          notlar: r.f.notlar, aciklama: r.f.aciklama, olusturmaTarihi: r.f.olusturmaTarihi,
        })),
      };
    });

    if (format === "csv") {
      const allRows = result.flatMap(d => d.faturalar.map(f => ({ Dilim: d.etiket, ...f })));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="alacak-yaslandirma.csv"');
      res.send(toCsv(allRows)); return;
    }

    res.json({ dilimler: result });
  } catch {
    res.status(500).json({ error: "Alacak yaşlandırma raporu alınamadı" });
  }
});

router.get("/raporlar/gemi-gelir", async (req, res) => {
  try {
    const { catiFirmaId, yil } = req.query as Record<string, string>;

    if (catiFirmaId && !sirketErisimKontrol(Number(catiFirmaId), req)) {
      res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return;
    }

    const rows = await db
      .select({ f: faturalar, gemiAd: gemiler.ad, gemiImo: gemiler.imoNumarasi })
      .from(faturalar)
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id));

    let filtered = rows.filter(r => r.f.gemiId !== null);

    if (catiFirmaId) {
      filtered = filtered.filter(r => r.f.catiFirmaId === Number(catiFirmaId));
    } else if (req.kullanici?.rol !== "yonetici") {
      const izinli = req.izinliSirketler ?? [];
      filtered = filtered.filter(r => izinli.includes(r.f.catiFirmaId));
    }

    if (yil) filtered = filtered.filter(r => r.f.faturaTarihi.startsWith(yil));

    const faturaIds = filtered.map(r => r.f.id);
    const odemeRows = faturaIds.length > 0
      ? await db.select().from(odemeler).where(inArray(odemeler.faturaId, faturaIds))
      : [];

    const tahsilatMap: Record<number, number> = {};
    for (const o of odemeRows) {
      if (o.faturaId && o.tip === "tahsilat") {
        tahsilatMap[o.faturaId] = (tahsilatMap[o.faturaId] ?? 0) + Number(o.tutar);
      }
    }

    const gemiMap: Record<number, {
      gemiId: number; gemiAd: string; gemiImo: string | null;
      toplamFatura: number; toplamTahsilat: number; faturaSayisi: number;
    }> = {};

    for (const r of filtered) {
      if (!r.f.gemiId) continue;
      if (!gemiMap[r.f.gemiId]) {
        gemiMap[r.f.gemiId] = {
          gemiId: r.f.gemiId, gemiAd: r.gemiAd ?? "Bilinmiyor",
          gemiImo: r.gemiImo ?? null, toplamFatura: 0, toplamTahsilat: 0, faturaSayisi: 0,
        };
      }
      gemiMap[r.f.gemiId].toplamFatura += Number(r.f.genelToplam);
      gemiMap[r.f.gemiId].toplamTahsilat += tahsilatMap[r.f.id] ?? 0;
      gemiMap[r.f.gemiId].faturaSayisi++;
    }

    const result = Object.values(gemiMap).sort((a, b) => b.toplamFatura - a.toplamFatura);
    res.json({ gemiler: result });
  } catch {
    res.status(500).json({ error: "Gemi gelir raporu alınamadı" });
  }
});

router.get("/raporlar/fatura-ozeti", async (req, res) => {
  try {
    const { catiFirmaId, yil } = req.query as Record<string, string>;

    if (catiFirmaId && !sirketErisimKontrol(Number(catiFirmaId), req)) {
      res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return;
    }

    let rows = await db.select().from(faturalar);

    if (catiFirmaId) {
      rows = rows.filter(f => f.catiFirmaId === Number(catiFirmaId));
    } else if (req.kullanici?.rol !== "yonetici") {
      const izinli = req.izinliSirketler ?? [];
      rows = rows.filter(f => izinli.includes(f.catiFirmaId));
    }
    if (yil) rows = rows.filter(f => f.faturaTarihi.startsWith(yil));

    const hedefYil = Number(yil) || new Date().getFullYear();

    const durumSayaci: Record<string, { sayi: number; tutar: number }> = {};
    for (const f of rows.filter(f => f.durum !== "taslak")) {
      if (!durumSayaci[f.durum]) durumSayaci[f.durum] = { sayi: 0, tutar: 0 };
      durumSayaci[f.durum].sayi++;
      durumSayaci[f.durum].tutar += Number(f.genelToplam);
    }

    const aylik = Array.from({ length: 12 }, (_, i) => {
      const ay = i + 1;
      const prefix = `${hedefYil}-${String(ay).padStart(2, "0")}`;
      const ayFaturalar = rows.filter(f => f.faturaTarihi.startsWith(prefix) && f.durum !== "taslak");
      return {
        ay, ayAd: AY_ADLARI[i],
        sayi: ayFaturalar.length,
        tutar: ayFaturalar.reduce((s, f) => s + Number(f.genelToplam), 0),
        odendi: ayFaturalar.filter(f => f.durum === "odendi").reduce((s, f) => s + Number(f.genelToplam), 0),
      };
    });

    const faturaIds = rows.map(f => f.id);
    const odemeRows = faturaIds.length > 0
      ? await db.select().from(odemeler).where(inArray(odemeler.faturaId, faturaIds))
      : [];
    const toplamTahsilat = odemeRows.filter(o => o.tip === "tahsilat").reduce((s, o) => s + Number(o.tutar), 0);
    const toplamFatura = rows.filter(f => f.durum !== "taslak").reduce((s, f) => s + Number(f.genelToplam), 0);
    const toplamAcik = rows.filter(f => f.durum === "acik" || f.durum === "kismi_odendi").reduce((s, f) => s + Number(f.genelToplam), 0);

    res.json({
      toplamFatura, toplamTahsilat, toplamAcik,
      faturaSayisi: rows.filter(f => f.durum !== "taslak").length,
      durumlar: Object.entries(durumSayaci).map(([durum, v]) => ({ durum, ...v })),
      aylik,
    });
  } catch {
    res.status(500).json({ error: "Fatura özeti alınamadı" });
  }
});

router.get("/raporlar/bagli-firma-analiz", async (req, res) => {
  try {
    const { catiFirmaId, yil } = req.query as Record<string, string>;

    if (catiFirmaId && !sirketErisimKontrol(Number(catiFirmaId), req)) {
      res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return;
    }

    const rows = await db
      .select({ f: faturalar, bagliFirmaAd: firmalar.ad })
      .from(faturalar)
      .leftJoin(firmalar, eq(faturalar.bagliFirmaId, firmalar.id));

    let filtered = rows.filter(r => r.f.durum !== "taslak");

    if (catiFirmaId) {
      filtered = filtered.filter(r => r.f.catiFirmaId === Number(catiFirmaId));
    } else if (req.kullanici?.rol !== "yonetici") {
      const izinli = req.izinliSirketler ?? [];
      filtered = filtered.filter(r => izinli.includes(r.f.catiFirmaId));
    }
    if (yil) filtered = filtered.filter(r => r.f.faturaTarihi.startsWith(yil));

    const faturaIds = filtered.map(r => r.f.id);
    const odemeRows = faturaIds.length > 0
      ? await db.select().from(odemeler).where(inArray(odemeler.faturaId, faturaIds))
      : [];
    const tahsilatMap: Record<number, number> = {};
    for (const o of odemeRows) {
      if (o.faturaId && o.tip === "tahsilat") {
        tahsilatMap[o.faturaId] = (tahsilatMap[o.faturaId] ?? 0) + Number(o.tutar);
      }
    }

    const map: Record<string, { bagliFirmaId: number | null; bagliFirmaAd: string; toplamFatura: number; toplamTahsilat: number; acikFatura: number; faturaSayisi: number }> = {};
    for (const r of filtered) {
      const key = r.f.bagliFirmaId != null ? String(r.f.bagliFirmaId) : "__yok__";
      const ad = r.bagliFirmaAd ?? (r.f.bagliFirmaId != null ? `Firma #${r.f.bagliFirmaId}` : "Bağlı Firma Yok");
      if (!map[key]) map[key] = { bagliFirmaId: r.f.bagliFirmaId ?? null, bagliFirmaAd: ad, toplamFatura: 0, toplamTahsilat: 0, acikFatura: 0, faturaSayisi: 0 };
      map[key].toplamFatura += Number(r.f.genelToplam);
      map[key].toplamTahsilat += tahsilatMap[r.f.id] ?? 0;
      if (r.f.durum === "acik" || r.f.durum === "kismi_odendi") map[key].acikFatura += Number(r.f.genelToplam);
      map[key].faturaSayisi++;
    }

    const result = Object.values(map).sort((a, b) => b.toplamFatura - a.toplamFatura);
    res.json({ firmalar: result });
  } catch {
    res.status(500).json({ error: "Bağlı firma analizi alınamadı" });
  }
});

export default router;
