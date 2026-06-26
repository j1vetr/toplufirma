import { Router } from "express";
import { db } from "@workspace/db";
import { firmalar, firmaEpostaAyarlari, faturalar, odemeler, firmaSirketGorunurluk } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireYazma, requireYonetici, sirketErisimKontrol, firmaYazmaDenetimi } from "../middleware/auth";
import { createRequire } from "node:module";
import path from "node:path";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import ExcelJS from "exceljs";

const _reqPdf = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _pdfmakeFirma = _reqPdf("pdfmake") as any;
const _pdfmakeFirmaDir = path.dirname(_reqPdf.resolve("pdfmake/package.json"));
_pdfmakeFirma.fonts = {
  Roboto: {
    normal:      path.join(_pdfmakeFirmaDir, "fonts/Roboto/Roboto-Regular.ttf"),
    bold:        path.join(_pdfmakeFirmaDir, "fonts/Roboto/Roboto-Medium.ttf"),
    italics:     path.join(_pdfmakeFirmaDir, "fonts/Roboto/Roboto-Italic.ttf"),
    bolditalics: path.join(_pdfmakeFirmaDir, "fonts/Roboto/Roboto-MediumItalic.ttf"),
  },
};
_pdfmakeFirma.setLocalAccessPolicy(() => true);

const router = Router();

router.get("/firmalar", async (req, res) => {
  try {
    const { tip, ustFirmaId } = req.query as Record<string, string>;

    const rows = await db.select().from(firmalar).orderBy(firmalar.ad);
    const adById = new Map(rows.map(r => [r.id, r.ad]));

    const gorunurlukRows = await db.select().from(firmaSirketGorunurluk);
    const gorunurlukMap = new Map<number, number[]>();
    for (const g of gorunurlukRows) {
      if (!gorunurlukMap.has(g.firmaId)) gorunurlukMap.set(g.firmaId, []);
      gorunurlukMap.get(g.firmaId)!.push(g.catiFirmaId);
    }

    let filtered = rows;
    if (req.kullanici?.rol !== "yonetici") {
      const izinli = req.izinliSirketler ?? [];
      filtered = rows.filter(f => {
        if (f.tip === "cati") return izinli.includes(f.id);
        if (f.tip === "grup") {
          const gorunur = gorunurlukMap.get(f.id);
          if (!gorunur || gorunur.length === 0) return true; // kısıtlanmamış → herkese görünür
          return gorunur.some(id => izinli.includes(id));
        }
        return f.ustFirmaId != null && izinli.includes(f.ustFirmaId);
      });
    }
    if (tip) filtered = filtered.filter(f => f.tip === tip);
    if (ustFirmaId) filtered = filtered.filter(f => f.ustFirmaId === Number(ustFirmaId));

    res.json(filtered.map(f => formatFirma(f, f.grupFirmaId ? adById.get(f.grupFirmaId) ?? null : null, gorunurlukMap.get(f.id) ?? [])));
  } catch {
    res.status(500).json({ error: "Firmalar listelenemedi" });
  }
});

router.post("/firmalar", requireYazma, async (req, res) => {
  try {
    const {
      tip, ustFirmaId, grupFirmaId, ad, vergiNo, vergiDairesi, adres, telefon, eposta,
      yetkiliKisi, paraBirimi, notlar, seriOneki, etiket, logoUrl, aktif,
    } = req.body;
    if (!tip || !ad) { res.status(400).json({ error: "tip ve ad zorunludur" }); return; }

    if (tip === "bagli") {
      if (ustFirmaId) {
        if (!sirketErisimKontrol(Number(ustFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
        if (!firmaYazmaDenetimi(Number(ustFirmaId), req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
        const [catiFirma] = await db.select().from(firmalar).where(eq(firmalar.id, Number(ustFirmaId)));
        if (!catiFirma || catiFirma.tip !== "cati") { res.status(400).json({ error: "ustFirmaId geçerli bir firma değil" }); return; }
      }
      if (grupFirmaId) {
        const [grup] = await db.select().from(firmalar).where(eq(firmalar.id, Number(grupFirmaId)));
        if (!grup || grup.tip !== "grup") { res.status(400).json({ error: "grupFirmaId geçerli bir çatı firma değil" }); return; }
      }
    } else if (tip === "grup") {
      // Çatı (grup) firmalar tüm yazma yetkili kullanıcılar tarafından oluşturulabilir
    } else {
      if (req.kullanici?.rol !== "yonetici") { res.status(403).json({ error: "Firma oluşturmak için yönetici yetkisi gerekli" }); return; }
    }

    const { gorunurSirketIds } = req.body;
    const [row] = await db.insert(firmalar).values({
      tip, ustFirmaId: tip === "bagli" ? (ustFirmaId ?? null) : null,
      grupFirmaId: tip === "bagli" && grupFirmaId ? Number(grupFirmaId) : null,
      ad, vergiNo, vergiDairesi, adres, telefon,
      eposta, yetkiliKisi, paraBirimi: paraBirimi ?? "USD", notlar,
      seriOneki, etiket, logo: logoUrl, aktif: aktif ?? true,
    }).returning();
    if (tip === "grup" && Array.isArray(gorunurSirketIds) && gorunurSirketIds.length > 0) {
      await db.insert(firmaSirketGorunurluk).values(
        gorunurSirketIds.map((sid: number) => ({ firmaId: row.id, catiFirmaId: Number(sid) }))
      );
    }
    res.status(201).json(formatFirma(row, null, Array.isArray(gorunurSirketIds) ? gorunurSirketIds.map(Number) : []));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique")) { res.status(409).json({ error: "Bu bilgilere sahip bir firma zaten mevcut" }); return; }
    res.status(500).json({ error: "Firma oluşturulamadı" });
  }
});

router.get("/firmalar/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }

    const catiFirmaId = firma.tip === "cati" ? firma.id : firma.tip === "bagli" ? firma.ustFirmaId : null;
    if (catiFirmaId && !sirketErisimKontrol(catiFirmaId, req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    let grupFirmaAd: string | null = null;
    if (firma.grupFirmaId) {
      const [g] = await db.select().from(firmalar).where(eq(firmalar.id, firma.grupFirmaId));
      grupFirmaAd = g?.ad ?? null;
    }

    const gorunurlukRows = firma.tip === "grup"
      ? await db.select().from(firmaSirketGorunurluk).where(eq(firmaSirketGorunurluk.firmaId, id))
      : [];
    const gorunurSirketIds = gorunurlukRows.map(g => g.catiFirmaId);

    let baglilar: ReturnType<typeof formatFirma>[] = [];
    if (firma.tip === "cati") {
      const b = await db.select().from(firmalar).where(and(eq(firmalar.ustFirmaId, id), eq(firmalar.aktif, true)));
      baglilar = b.map(x => formatFirma(x));
    }

    res.json({ ...formatFirma(firma, grupFirmaAd, gorunurSirketIds), baglilar });
  } catch {
    res.status(500).json({ error: "Firma getirilemedi" });
  }
});

router.patch("/firmalar/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!existing) { res.status(404).json({ error: "Firma bulunamadı" }); return; }

    const catiFirmaId = existing.tip === "cati" ? existing.id : existing.tip === "bagli" ? existing.ustFirmaId : null;
    if (catiFirmaId && !sirketErisimKontrol(catiFirmaId, req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    if (catiFirmaId && !firmaYazmaDenetimi(catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const { ad, grupFirmaId, vergiNo, vergiDairesi, adres, telefon, eposta, yetkiliKisi, paraBirimi, notlar, seriOneki, etiket, logoUrl, aktif, gorunurSirketIds } = req.body;
    if (grupFirmaId !== undefined && grupFirmaId !== null && existing.tip === "bagli") {
      const [grup] = await db.select().from(firmalar).where(eq(firmalar.id, Number(grupFirmaId)));
      if (!grup || grup.tip !== "grup") { res.status(400).json({ error: "grupFirmaId geçerli bir çatı firma değil" }); return; }
    }
    const [row] = await db.update(firmalar)
      .set({
        ad, vergiNo, vergiDairesi, adres, telefon, eposta, yetkiliKisi, paraBirimi, notlar, seriOneki, etiket, logo: logoUrl, aktif,
        ...(existing.tip === "bagli" && grupFirmaId !== undefined ? { grupFirmaId: grupFirmaId === null ? null : Number(grupFirmaId) } : {}),
      })
      .where(eq(firmalar.id, id)).returning();
    let grupFirmaAd: string | null = null;
    if (row.grupFirmaId) {
      const [g] = await db.select().from(firmalar).where(eq(firmalar.id, row.grupFirmaId));
      grupFirmaAd = g?.ad ?? null;
    }
    if (existing.tip === "grup" && Array.isArray(gorunurSirketIds)) {
      await db.delete(firmaSirketGorunurluk).where(eq(firmaSirketGorunurluk.firmaId, id));
      if (gorunurSirketIds.length > 0) {
        await db.insert(firmaSirketGorunurluk).values(
          gorunurSirketIds.map((sid: number) => ({ firmaId: id, catiFirmaId: Number(sid) }))
        );
      }
    }
    const gorunurSirketIdsResult = existing.tip === "grup"
      ? (Array.isArray(gorunurSirketIds) ? gorunurSirketIds.map(Number) : (await db.select().from(firmaSirketGorunurluk).where(eq(firmaSirketGorunurluk.firmaId, id))).map(g => g.catiFirmaId))
      : [];
    res.json(formatFirma(row, grupFirmaAd, gorunurSirketIdsResult));
  } catch {
    res.status(500).json({ error: "Firma güncellenemedi" });
  }
});

router.delete("/firmalar/:id", requireYonetici, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!existing) { res.status(404).json({ error: "Firma bulunamadı" }); return; }

    const bagliSayisi = (await db.select().from(firmalar).where(eq(firmalar.ustFirmaId, id))).length;
    if (bagliSayisi > 0) { res.status(409).json({ error: "Bu firmaya bağlı alt firmalar var. Önce onları silin." }); return; }

    if (existing.tip === "grup") {
      const grupUyeSayisi = (await db.select().from(firmalar).where(eq(firmalar.grupFirmaId, id))).length;
      if (grupUyeSayisi > 0) { res.status(409).json({ error: "Bu çatı firmaya bağlı firmalar var. Önce onların çatı firma bağlantısını kaldırın." }); return; }
    }

    await db.delete(firmalar).where(eq(firmalar.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Firma silinemedi" });
  }
});

router.get("/firmalar/:id/ekstre", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { baslangicTarihi, bitisTarihi } = req.query as Record<string, string>;
    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }
    if (firma.tip !== "bagli") { res.status(400).json({ error: "Ekstre yalnızca bağlı firmalar için mevcuttur" }); return; }

    const catiFirmaId = firma.ustFirmaId!;
    if (!sirketErisimKontrol(catiFirmaId, req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const faturalarRows = await db.select().from(faturalar)
      .where(and(eq(faturalar.catiFirmaId, catiFirmaId), eq(faturalar.bagliFirmaId, id)));
    const odemelerRows = await db.select().from(odemeler)
      .where(and(eq(odemeler.catiFirmaId, catiFirmaId), eq(odemeler.bagliFirmaId, id)));

    const fatFilt = faturalarRows.filter(f =>
      (!baslangicTarihi || f.faturaTarihi >= baslangicTarihi) &&
      (!bitisTarihi || f.faturaTarihi <= bitisTarihi)
    );
    const odFilt = odemelerRows.filter(o =>
      (!baslangicTarihi || o.tarih >= baslangicTarihi) &&
      (!bitisTarihi || o.tarih <= bitisTarihi)
    );

    const fatKalemler = fatFilt.map(f => ({
      id: f.id,
      tip: "fatura" as const,
      tarih: f.faturaTarihi,
      aciklama: f.aciklama ?? f.faturaNo,
      referansNo: f.faturaNo,
      gemiAd: null as string | null,
      borc: Number(f.genelToplam),
      alacak: null as number | null,
      tutar: Number(f.genelToplam),
      paraBirimi: f.paraBirimi,
    }));
    const odKalemler = odFilt.map(o => ({
      id: o.id,
      tip: o.tip as "odeme" | "tahsilat",
      tarih: o.tarih,
      aciklama: o.aciklama ?? null,
      referansNo: null as string | null,
      gemiAd: null as string | null,
      borc: null as number | null,
      alacak: Number(o.tutar),
      tutar: Number(o.tutar),
      paraBirimi: o.paraBirimi,
    }));

    const kalemler = [...fatKalemler, ...odKalemler].sort((a, b) => a.tarih.localeCompare(b.tarih));
    const toplamBorc = fatKalemler.reduce((s, k) => s + k.tutar, 0);
    const toplamAlacak = odKalemler.filter(k => k.tip === "tahsilat").reduce((s, k) => s + k.tutar, 0);
    const kalanBakiye = toplamBorc - toplamAlacak;

    res.json({ firmaId: id, firmaAd: firma.ad, kalemler, toplamBorc, toplamAlacak, kalanBakiye });
  } catch {
    res.status(500).json({ error: "Ekstre getirilemedi" });
  }
});

router.get("/firmalar/:id/ekstre/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { baslangicTarihi, bitisTarihi } = req.query as Record<string, string>;
    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }
    if (firma.tip !== "bagli") { res.status(400).json({ error: "Ekstre yalnızca bağlı firmalar için mevcuttur" }); return; }
    const catiFirmaId = firma.ustFirmaId!;
    if (!sirketErisimKontrol(catiFirmaId, req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const faturalarRows = await db.select().from(faturalar)
      .where(and(eq(faturalar.catiFirmaId, catiFirmaId), eq(faturalar.bagliFirmaId, id)));
    const odemelerRows = await db.select().from(odemeler)
      .where(and(eq(odemeler.catiFirmaId, catiFirmaId), eq(odemeler.bagliFirmaId, id)));

    const fatFilt = faturalarRows.filter(f =>
      (!baslangicTarihi || f.faturaTarihi >= baslangicTarihi) && (!bitisTarihi || f.faturaTarihi <= bitisTarihi));
    const odFilt = odemelerRows.filter(o =>
      (!baslangicTarihi || o.tarih >= baslangicTarihi) && (!bitisTarihi || o.tarih <= bitisTarihi));

    const kalemler = [
      ...fatFilt.map(f => ({ tarih: f.faturaTarihi, tip: "Fatura", aciklama: f.aciklama ?? f.faturaNo, referansNo: f.faturaNo, borc: Number(f.genelToplam), alacak: null as number | null, paraBirimi: f.paraBirimi })),
      ...odFilt.map(o => ({ tarih: o.tarih, tip: o.tip === "tahsilat" ? "Tahsilat" : "Ödeme", aciklama: o.aciklama ?? "", referansNo: null as string | null, borc: null as number | null, alacak: Number(o.tutar), paraBirimi: o.paraBirimi })),
    ].sort((a, b) => a.tarih.localeCompare(b.tarih));

    const toplamBorc = fatFilt.reduce((s, f) => s + Number(f.genelToplam), 0);
    const toplamAlacak = odFilt.filter(o => o.tip === "tahsilat").reduce((s, o) => s + Number(o.tutar), 0);
    const kalanBakiye = toplamBorc - toplamAlacak;

    const docDef: TDocumentDefinitions = {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      content: [
        { text: `Cari Ekstre: ${firma.ad}`, style: "header" } as unknown as import("pdfmake/interfaces").Content,
        { text: `${baslangicTarihi ?? "-"} / ${bitisTarihi ?? "-"}`, style: "subheader" } as unknown as import("pdfmake/interfaces").Content,
        {
          table: {
            headerRows: 1,
            widths: [60, 60, "*", 70, 60, 60],
            body: [
              ["Tarih", "Tip", "Açıklama", "Referans", "Borç", "Alacak"].map(t => ({ text: t, bold: true, fillColor: "#f0f0f0" })),
              ...kalemler.map(k => [k.tarih, k.tip, k.aciklama ?? "-", k.referansNo ?? "-", k.borc != null ? k.borc.toFixed(2) : "-", k.alacak != null ? k.alacak.toFixed(2) : "-"]),
            ],
          },
          layout: "lightHorizontalLines",
        },
        { text: `Toplam Borç: ${toplamBorc.toFixed(2)}   Toplam Alacak: ${toplamAlacak.toFixed(2)}   Kalan Bakiye: ${kalanBakiye.toFixed(2)}`, margin: [0, 12, 0, 0] as [number, number, number, number] },
      ],
      styles: {
        header: { fontSize: 15, bold: true, margin: [0, 0, 0, 6] as [number, number, number, number] },
        subheader: { fontSize: 10, color: "#666666", margin: [0, 0, 0, 14] as [number, number, number, number] },
      },
      defaultStyle: { fontSize: 9, font: "Roboto" },
    };

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${firma.ad.replace(/[^a-z0-9]/gi, "-")}-ekstre.pdf"`);
    _pdfmakeFirma.createPdf(docDef).getStream().pipe(res);
  } catch {
    res.status(500).json({ error: "Ekstre PDF oluşturulamadı" });
  }
});

router.get("/firmalar/:id/ekstre/excel", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { baslangicTarihi, bitisTarihi } = req.query as Record<string, string>;
    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }
    if (firma.tip !== "bagli") { res.status(400).json({ error: "Ekstre yalnızca bağlı firmalar için mevcuttur" }); return; }
    const catiFirmaId = firma.ustFirmaId!;
    if (!sirketErisimKontrol(catiFirmaId, req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const faturalarRows = await db.select().from(faturalar)
      .where(and(eq(faturalar.catiFirmaId, catiFirmaId), eq(faturalar.bagliFirmaId, id)));
    const odemelerRows = await db.select().from(odemeler)
      .where(and(eq(odemeler.catiFirmaId, catiFirmaId), eq(odemeler.bagliFirmaId, id)));

    const fatFilt = faturalarRows.filter(f =>
      (!baslangicTarihi || f.faturaTarihi >= baslangicTarihi) && (!bitisTarihi || f.faturaTarihi <= bitisTarihi));
    const odFilt = odemelerRows.filter(o =>
      (!baslangicTarihi || o.tarih >= baslangicTarihi) && (!bitisTarihi || o.tarih <= bitisTarihi));

    const kalemler = [
      ...fatFilt.map(f => ({ tarih: f.faturaTarihi, tip: "Fatura", aciklama: f.aciklama ?? f.faturaNo, referansNo: f.faturaNo, borc: Number(f.genelToplam), alacak: null as number | null, paraBirimi: f.paraBirimi })),
      ...odFilt.map(o => ({ tarih: o.tarih, tip: o.tip === "tahsilat" ? "Tahsilat" : "Ödeme", aciklama: o.aciklama ?? "", referansNo: null as string | null, borc: null as number | null, alacak: Number(o.tutar), paraBirimi: o.paraBirimi })),
    ].sort((a, b) => a.tarih.localeCompare(b.tarih));

    const wb = new ExcelJS.Workbook();
    wb.creator = "Muhasebe Paneli";
    const ws = wb.addWorksheet("Cari Ekstre");
    ws.columns = [
      { header: "Tarih", key: "tarih", width: 14 },
      { header: "Tip", key: "tip", width: 14 },
      { header: "Açıklama", key: "aciklama", width: 36 },
      { header: "Referans No", key: "referansNo", width: 18 },
      { header: "Borç", key: "borc", width: 16 },
      { header: "Alacak", key: "alacak", width: 16 },
      { header: "Para Birimi", key: "paraBirimi", width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const k of kalemler) {
      ws.addRow({ tarih: k.tarih, tip: k.tip, aciklama: k.aciklama ?? "", referansNo: k.referansNo ?? "", borc: k.borc ?? "", alacak: k.alacak ?? "", paraBirimi: k.paraBirimi });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${firma.ad.replace(/[^a-z0-9]/gi, "-")}-ekstre.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await wb.xlsx.write(res);
    res.end();
  } catch {
    res.status(500).json({ error: "Ekstre Excel oluşturulamadı" });
  }
});

router.get("/firmalar/:id/eposta-ayarlari", requireYonetici, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }
    if (firma.tip !== "cati") { res.status(400).json({ error: "E-posta ayarları yalnızca çatı firmalar için mevcuttur" }); return; }

    const [ayarlar] = await db.select().from(firmaEpostaAyarlari).where(eq(firmaEpostaAyarlari.firmaId, id));
    if (!ayarlar) { res.json(null); return; }
    res.json({ ...ayarlar, smtpSifre: ayarlar.smtpSifre ? "••••••••" : null });
  } catch {
    res.status(500).json({ error: "E-posta ayarları getirilemedi" });
  }
});

router.put("/firmalar/:id/eposta-ayarlari", requireYonetici, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }
    if (firma.tip !== "cati") { res.status(400).json({ error: "E-posta ayarları yalnızca çatı firmalar için mevcuttur" }); return; }

    const { smtpHost, smtpPort, smtpGuvenlik, smtpKullanici, smtpSifre, gonderenAd, gonderenAdres, aktif } = req.body;
    const [existing] = await db.select().from(firmaEpostaAyarlari).where(eq(firmaEpostaAyarlari.firmaId, id));

    const sifreDegistirildi = smtpSifre && smtpSifre !== "••••••••";
    if (!existing && !sifreDegistirildi) { res.status(400).json({ error: "Yeni kayıt için SMTP şifresi zorunludur" }); return; }

    const vals = {
      smtpHost, smtpPort: smtpPort ?? 587, smtpGuvenlik: smtpGuvenlik ?? "starttls",
      smtpKullanici, gonderenAd, gonderenAdres, aktif: aktif ?? true,
      ...(sifreDegistirildi ? { smtpSifre } : {}),
    };

    let row;
    if (existing) {
      [row] = await db.update(firmaEpostaAyarlari).set(vals).where(eq(firmaEpostaAyarlari.firmaId, id)).returning();
    } else {
      [row] = await db.insert(firmaEpostaAyarlari).values({ firmaId: id, smtpSifre, ...vals }).returning();
    }
    res.json({ ...row, smtpSifre: row.smtpSifre ? "••••••••" : null });
  } catch {
    res.status(500).json({ error: "E-posta ayarları kaydedilemedi" });
  }
});

function formatFirma(f: typeof firmalar.$inferSelect, grupFirmaAd: string | null = null, gorunurSirketIds: number[] = []) {
  return {
    id: f.id, tip: f.tip, ustFirmaId: f.ustFirmaId,
    grupFirmaId: f.grupFirmaId, grupFirmaAd,
    ad: f.ad, vergiNo: f.vergiNo, vergiDairesi: f.vergiDairesi,
    adres: f.adres, telefon: f.telefon, eposta: f.eposta,
    yetkiliKisi: f.yetkiliKisi, paraBirimi: f.paraBirimi,
    notlar: f.notlar, seriOneki: f.seriOneki, etiket: f.etiket,
    logoUrl: f.logo, aktif: f.aktif, olusturmaTarihi: f.olusturmaTarihi,
    gorunurSirketIds,
  };
}

export default router;
