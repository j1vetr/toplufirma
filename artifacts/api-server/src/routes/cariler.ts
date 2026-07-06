import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, firmalar, odemeler, bankaHesaplari, firmaEpostaAyarlari, gonderiGecmisi } from "@workspace/db";
import { eq, and, inArray, gte, lte, lt } from "drizzle-orm";
import { sirketErisimKontrol, requireYazma, firmaYazmaDenetimi } from "../middleware/auth";
import { createRequire } from "node:module";
import path from "node:path";
import nodemailer from "nodemailer";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

const _req = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _pdfmake = _req("pdfmake") as any;
const _pdfmakeDir = path.dirname(_req.resolve("pdfmake/package.json"));
_pdfmake.fonts = {
  Roboto: {
    normal:      path.join(_pdfmakeDir, "fonts/Roboto/Roboto-Regular.ttf"),
    bold:        path.join(_pdfmakeDir, "fonts/Roboto/Roboto-Medium.ttf"),
    italics:     path.join(_pdfmakeDir, "fonts/Roboto/Roboto-Italic.ttf"),
    bolditalics: path.join(_pdfmakeDir, "fonts/Roboto/Roboto-MediumItalic.ttf"),
  },
};
_pdfmake.setLocalAccessPolicy(() => true);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ExcelJS = _req("exceljs") as any;

const router = Router();

function buildEntries(faturaRows: typeof faturalar.$inferSelect[], odemeRows: typeof odemeler.$inferSelect[]) {
  const validFaturalar = faturaRows.filter(f => !["taslak", "iptal"].includes(f.durum));
  const fEntries = validFaturalar.map(f => ({
    id: `f-${f.id}`,
    tarih: f.faturaTarihi as string,
    tip: "fatura" as const,
    aciklama: [f.faturaNo, f.faturaAdi].filter(Boolean).join(" — "),
    borc: Number(f.genelToplam),
    alacak: 0,
    paraBirimi: f.paraBirimi,
    faturaId: f.id,
    durum: f.durum,
  }));
  const oEntries = odemeRows.map(o => ({
    id: `o-${o.id}`,
    tarih: o.tarih as string,
    tip: o.tip as "tahsilat" | "odeme",
    aciklama: o.aciklama ?? (o.tip === "tahsilat" ? "Tahsilat" : "Ödeme"),
    borc: o.tip === "odeme" ? Number(o.tutar) : 0,
    alacak: o.tip === "tahsilat" ? Number(o.tutar) : 0,
    paraBirimi: o.paraBirimi,
    faturaId: o.faturaId ?? null,
    durum: null,
  }));
  const sorted = [...fEntries, ...oEntries].sort((a, b) => {
    const d = new Date(a.tarih).getTime() - new Date(b.tarih).getTime();
    if (d !== 0) return d;
    if (a.tip === "fatura" && b.tip !== "fatura") return -1;
    return 1;
  });
  let bakiye = 0;
  return sorted.map(e => { bakiye += e.borc - e.alacak; return { ...e, bakiye }; });
}

async function resolveCatiFirmaId(
  bagliFirmaId: number,
  ustFirmaId: number | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
): Promise<number | null> {
  const candidates: number[] = [];
  if (ustFirmaId) candidates.push(ustFirmaId);

  const rows = await db
    .select({ catiFirmaId: faturalar.catiFirmaId })
    .from(faturalar)
    .where(eq(faturalar.bagliFirmaId, bagliFirmaId));

  for (const row of rows) {
    if (!candidates.includes(row.catiFirmaId)) {
      candidates.push(row.catiFirmaId);
    }
  }

  for (const candidate of candidates) {
    if (sirketErisimKontrol(candidate, req)) return candidate;
  }

  return null;
}

router.get("/cariler", async (req, res) => {
  try {
    const { catiFirmaId } = req.query as Record<string, string>;
    const izinliSirketler = req.izinliSirketler ?? [];

    if (catiFirmaId && !izinliSirketler.includes(Number(catiFirmaId))) {
      res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return;
    }

    const gecerliFirmaIdleri = catiFirmaId ? [Number(catiFirmaId)] : izinliSirketler;
    if (gecerliFirmaIdleri.length === 0) { res.json([]); return; }

    const [allBagli, faturaDiscover] = await Promise.all([
      db.select().from(firmalar).where(eq(firmalar.tip, "bagli")),
      db.select({ bagliFirmaId: faturalar.bagliFirmaId, catiFirmaId: faturalar.catiFirmaId })
        .from(faturalar)
        .where(inArray(faturalar.catiFirmaId, gecerliFirmaIdleri)),
    ]);

    const catiMap = new Map<number, number>();

    for (const f of allBagli) {
      if (f.ustFirmaId && gecerliFirmaIdleri.includes(f.ustFirmaId)) {
        catiMap.set(f.id, f.ustFirmaId);
      }
    }
    for (const p of faturaDiscover) {
      if (!catiMap.has(p.bagliFirmaId)) {
        catiMap.set(p.bagliFirmaId, p.catiFirmaId);
      }
    }

    if (catiMap.size === 0) { res.json([]); return; }

    const erisilenIdleri = [...catiMap.keys()];

    const erisilenFirmalar = allBagli.filter(f => erisilenIdleri.includes(f.id));
    const missingIds = erisilenIdleri.filter(id => !allBagli.some(f => f.id === id));
    const missingFirmalar = missingIds.length > 0
      ? await db.select().from(firmalar).where(inArray(firmalar.id, missingIds))
      : [];

    const erisilen = [...erisilenFirmalar, ...missingFirmalar];
    if (erisilen.length === 0) { res.json([]); return; }

    const bagliFirmaIdleri = erisilen.map(f => f.id);
    const catiFirmaIdleri = [...new Set([...catiMap.values()])];

    const [catiFirmalar, faturaRows, odemeRows] = await Promise.all([
      db.select({ id: firmalar.id, ad: firmalar.ad }).from(firmalar).where(inArray(firmalar.id, catiFirmaIdleri)),
      db.select().from(faturalar).where(inArray(faturalar.bagliFirmaId, bagliFirmaIdleri)),
      db.select().from(odemeler).where(inArray(odemeler.bagliFirmaId, bagliFirmaIdleri)),
    ]);

    const result = erisilen.map(bf => {
      const effectiveCati = catiMap.get(bf.id);
      const catiFirma = catiFirmalar.find(c => c.id === effectiveCati);
      const bFaturalar = faturaRows.filter(f => f.bagliFirmaId === bf.id);
      const bOdemeler = odemeRows.filter(o => o.bagliFirmaId === bf.id);
      const validF = bFaturalar.filter(f => !["taslak", "iptal"].includes(f.durum));

      const toplamBorc =
        validF.reduce((s, f) => s + Number(f.genelToplam), 0) +
        bOdemeler.filter(o => o.tip === "odeme").reduce((s, o) => s + Number(o.tutar), 0);
      const toplamAlacak = bOdemeler.filter(o => o.tip === "tahsilat").reduce((s, o) => s + Number(o.tutar), 0);
      const bakiye = toplamBorc - toplamAlacak;
      const acikFaturaAdedi = bFaturalar.filter(f => ["acik", "kismi_odendi"].includes(f.durum)).length;

      return {
        bagliFirmaId: bf.id,
        bagliFirmaAd: bf.ad,
        catiFirmaId: effectiveCati ?? null,
        catiFirmaAd: catiFirma?.ad ?? null,
        toplamBorc,
        toplamAlacak,
        bakiye,
        acikFaturaAdedi,
        paraBirimi: bf.paraBirimi || "USD",
      };
    });

    result.sort((a, b) => b.bakiye - a.bakiye);
    res.json(result);
  } catch (err) {
    console.error("[cariler] list error:", err);
    res.status(500).json({ error: "Cariler listelenemedi" });
  }
});

router.get("/cariler/:bagliFirmaId/pdf", async (req, res) => {
  try {
    const bagliFirmaId = Number(req.params.bagliFirmaId);
    const { baslangic, bitis } = req.query as Record<string, string>;

    const [bagliFirma] = await db.select().from(firmalar).where(eq(firmalar.id, bagliFirmaId));
    if (!bagliFirma || bagliFirma.tip !== "bagli") { res.status(404).json({ error: "Cari bulunamadı" }); return; }

    const catiId = await resolveCatiFirmaId(bagliFirmaId, bagliFirma.ustFirmaId, req);
    if (!catiId) {
      res.status(403).json({ error: "Bu cariye erişim izniniz yok" }); return;
    }

    const [catiFirma] = await db.select().from(firmalar).where(eq(firmalar.id, catiId));

    const faturaConds = [eq(faturalar.bagliFirmaId, bagliFirmaId)];
    if (baslangic) faturaConds.push(gte(faturalar.faturaTarihi, baslangic));
    if (bitis) faturaConds.push(lte(faturalar.faturaTarihi, bitis));

    const odemeConds = [eq(odemeler.bagliFirmaId, bagliFirmaId)];
    if (baslangic) odemeConds.push(gte(odemeler.tarih, baslangic));
    if (bitis) odemeConds.push(lte(odemeler.tarih, bitis));

    const [faturaRows, odemeRows] = await Promise.all([
      db.select().from(faturalar).where(and(...faturaConds)),
      db.select().from(odemeler).where(and(...odemeConds)),
    ]);

    const kalemler = buildEntries(faturaRows, odemeRows);
    const toplamBorc = kalemler.reduce((s, e) => s + e.borc, 0);
    const toplamAlacak = kalemler.reduce((s, e) => s + e.alacak, 0);
    const bakiye = toplamBorc - toplamAlacak;
    const paraBirimi = bagliFirma.paraBirimi || "USD";

    const fmt = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const donemStr = baslangic || bitis
      ? `${baslangic || "Başlangıç"} — ${bitis || "Bugün"}`
      : "Tüm Dönem";
    const tarihStr = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });

    const dataRows = kalemler.map(e => {
      const turEtiket = e.tip === "fatura" ? "Fatura" : e.tip === "tahsilat" ? "Tahsilat" : "Ödeme";
      const bakiyeRenk = e.bakiye > 0.005 ? "#d97706" : e.bakiye < -0.005 ? "#dc2626" : "#16a34a";
      return [
        { text: e.tarih, fontSize: 8, color: "#555" },
        {
          stack: [
            { text: e.aciklama, fontSize: 8.5 },
            { text: turEtiket, fontSize: 7, color: e.tip === "fatura" ? "#0070d1" : e.tip === "tahsilat" ? "#16a34a" : "#d97706", marginTop: 1 },
          ],
        },
        { text: e.borc > 0 ? fmt(e.borc) : "", alignment: "right", fontSize: 8.5 },
        { text: e.alacak > 0 ? fmt(e.alacak) : "", alignment: "right", fontSize: 8.5, color: "#16a34a" },
        { text: fmt(Math.abs(e.bakiye)), alignment: "right", fontSize: 8.5, bold: true, color: bakiyeRenk },
      ];
    });

    const docDefinition: TDocumentDefinitions = {
      defaultStyle: { font: "Roboto", fontSize: 9 },
      pageMargins: [40, 55, 40, 55],
      content: [
        {
          columns: [
            catiFirma?.logo
              ? { image: catiFirma.logo, width: 160, marginBottom: 4 }
              : {
                  stack: [
                    { text: catiFirma?.ad ?? "", fontSize: 15, bold: true, color: "#0070d1" },
                    ...(catiFirma?.adres ? [{ text: catiFirma.adres, color: "#555", fontSize: 8, marginTop: 2 }] : []),
                    ...(catiFirma?.vergiNo ? [{ text: `Tax No: ${catiFirma.vergiNo}`, color: "#555", fontSize: 8, marginTop: 1 }] : []),
                  ],
                },
            {
              stack: [
                { text: "CARİ HESAP EKSTRESİ", fontSize: 18, bold: true, color: "#0070d1", alignment: "right" },
                { text: `Düzenleme Tarihi: ${tarihStr}`, fontSize: 8, color: "#555", alignment: "right", marginTop: 4 },
                { text: `Dönem: ${donemStr}`, fontSize: 8, color: "#555", alignment: "right", marginTop: 2 },
              ],
              width: "*",
            },
          ],
          marginBottom: 14,
        },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: "#0070d1" }], marginBottom: 14 },
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "MÜŞTERİ", fontSize: 7, bold: true, color: "#888", characterSpacing: 1 },
                { text: bagliFirma.ad, bold: true, fontSize: 11, marginTop: 4 },
                ...(bagliFirma.adres ? [{ text: bagliFirma.adres, color: "#555", fontSize: 8, marginTop: 2 }] : []),
                ...(bagliFirma.vergiNo ? [{ text: `Vergi No: ${bagliFirma.vergiNo}`, color: "#555", fontSize: 8, marginTop: 1 }] : []),
                ...(bagliFirma.telefon ? [{ text: `Tel: ${bagliFirma.telefon}`, color: "#555", fontSize: 8, marginTop: 1 }] : []),
              ],
            },
            {
              width: 220,
              table: {
                widths: ["*", "*", "*"],
                body: [
                  [
                    { text: "TOPLAM BORÇ", fontSize: 7, bold: true, color: "#888", characterSpacing: 0.5, alignment: "center", fillColor: "#f9fafc", border: [true, true, true, false] },
                    { text: "TOPLAM ALACAK", fontSize: 7, bold: true, color: "#888", characterSpacing: 0.5, alignment: "center", fillColor: "#f9fafc", border: [true, true, true, false] },
                    { text: "BAKİYE", fontSize: 7, bold: true, color: "#888", characterSpacing: 0.5, alignment: "center", fillColor: "#f9fafc", border: [true, true, true, false] },
                  ],
                  [
                    { text: `${fmt(toplamBorc)}\n${paraBirimi}`, fontSize: 9, bold: true, alignment: "center", marginTop: 4, marginBottom: 4, border: [true, false, true, true] },
                    { text: `${fmt(toplamAlacak)}\n${paraBirimi}`, fontSize: 9, bold: true, color: "#16a34a", alignment: "center", marginTop: 4, marginBottom: 4, border: [true, false, true, true] },
                    {
                      text: `${fmt(Math.abs(bakiye))}\n${paraBirimi}`,
                      fontSize: 9, bold: true,
                      color: bakiye > 0.005 ? "#d97706" : bakiye < -0.005 ? "#dc2626" : "#16a34a",
                      alignment: "center", marginTop: 4, marginBottom: 4, border: [true, false, true, true],
                    },
                  ],
                ],
              },
              layout: { hLineColor: () => "#e8eaf0", vLineColor: () => "#e8eaf0" },
            },
          ],
          marginBottom: 18,
        },
        kalemler.length > 0
          ? {
              table: {
                headerRows: 1,
                widths: [52, "*", 75, 75, 82],
                body: [
                  [
                    { text: "TARİH", style: "thStyle" },
                    { text: "AÇIKLAMA", style: "thStyle" },
                    { text: "BORÇ", style: "thStyle", alignment: "right" },
                    { text: "ALACAK", style: "thStyle", alignment: "right" },
                    { text: "BAKİYE", style: "thStyle", alignment: "right" },
                  ],
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ...dataRows as any,
                ],
              },
              layout: {
                hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
                  i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
                vLineWidth: () => 0,
                hLineColor: (i: number) => (i === 0 || i === 1 ? "#0070d1" : "#e8eaf0"),
                fillColor: (i: number) => (i === 0 ? "#0070d1" : i % 2 === 0 ? "#f9fafc" : null),
                paddingTop: () => 5,
                paddingBottom: () => 5,
              },
            }
          : { text: "Bu dönemde kayıt bulunamadı.", color: "#888", italics: true, marginTop: 8 },
        ...(bakiye > 0.005
          ? [{
              columns: [
                { width: "*", text: "" },
                {
                  width: 240,
                  table: {
                    widths: ["*", "auto"],
                    body: [[
                      { text: "BAKİYE (TAHSIL EDİLECEK):", bold: true, fontSize: 10, color: "#d97706" },
                      { text: `${fmt(bakiye)} ${paraBirimi}`, alignment: "right", bold: true, fontSize: 10, color: "#d97706" },
                    ]],
                  },
                  layout: {
                    hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 1.5 : 0),
                    vLineWidth: () => 0,
                    hLineColor: () => "#d97706",
                  },
                  marginTop: 10,
                },
              ],
            } as unknown as import("pdfmake/interfaces").Content]
          : []),
        {
          text: `Bu ekstre ${tarihStr} tarihinde ${catiFirma?.ad ?? ""} tarafından düzenlenmiştir.`,
          fontSize: 7, color: "#aaa", italics: true, marginTop: 20, alignment: "center",
        },
      ],
      styles: {
        thStyle: { bold: true, color: "#ffffff", fillColor: "#0070d1", fontSize: 8, characterSpacing: 0.3 },
      },
    };

    const pdfStream: NodeJS.ReadableStream & { end(): void } = await _pdfmake.createPdf(docDefinition).getStream();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="cari-${bagliFirma.ad.replace(/\s+/g, "-")}.pdf"`);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    pdfStream.pipe(res);
    pdfStream.end();
  } catch (err) {
    console.error("[cariler/pdf] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "PDF oluşturulamadı" });
  }
});

router.get("/cariler/:bagliFirmaId/excel", async (req, res) => {
  try {
    const bagliFirmaId = Number(req.params.bagliFirmaId);
    const { baslangic, bitis } = req.query as Record<string, string | undefined>;

    const [bagliFirma] = await db.select().from(firmalar).where(eq(firmalar.id, bagliFirmaId));
    if (!bagliFirma || bagliFirma.tip !== "bagli") { res.status(404).json({ error: "Cari bulunamadı" }); return; }

    const catiId = await resolveCatiFirmaId(bagliFirmaId, bagliFirma.ustFirmaId, req);
    if (!catiId) { res.status(403).json({ error: "Bu cariye erişim izniniz yok" }); return; }

    const faturaConds: ReturnType<typeof eq>[] = [eq(faturalar.bagliFirmaId, bagliFirmaId)];
    if (baslangic) faturaConds.push(gte(faturalar.faturaTarihi, baslangic));
    if (bitis) faturaConds.push(lte(faturalar.faturaTarihi, bitis));

    const odemeConds: ReturnType<typeof eq>[] = [eq(odemeler.bagliFirmaId, bagliFirmaId)];
    if (baslangic) odemeConds.push(gte(odemeler.tarih, baslangic));
    if (bitis) odemeConds.push(lte(odemeler.tarih, bitis));

    const [faturaRows, odemeRows] = await Promise.all([
      db.select().from(faturalar).where(and(...faturaConds)),
      db.select().from(odemeler).where(and(...odemeConds)),
    ]);

    const kalemler = buildEntries(faturaRows, odemeRows);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "TOOV";
    workbook.created = new Date();

    const ws = workbook.addWorksheet("Ekstre");
    ws.columns = [
      { header: "Tarih",       key: "tarih",       width: 14 },
      { header: "Açıklama",    key: "aciklama",    width: 44 },
      { header: "Tür",         key: "tur",         width: 12 },
      { header: "Borç",        key: "borc",        width: 16 },
      { header: "Alacak",      key: "alacak",      width: 16 },
      { header: "Bakiye",      key: "bakiye",      width: 16 },
      { header: "Para Birimi", key: "paraBirimi",  width: 13 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C3C6E" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = { bottom: { style: "medium", color: { argb: "FFFFED00" } } };
    });

    const TUR_ETIKET: Record<string, string> = { fatura: "Fatura", tahsilat: "Tahsilat", odeme: "Ödeme" };

    for (const e of kalemler) {
      const row = ws.addRow({
        tarih:      e.tarih,
        aciklama:   e.aciklama,
        tur:        TUR_ETIKET[e.tip] ?? e.tip,
        borc:       e.borc   > 0.005 ? e.borc   : null,
        alacak:     e.alacak > 0.005 ? e.alacak : null,
        bakiye:     e.bakiye,
        paraBirimi: e.paraBirimi,
      });

      (["borc", "alacak", "bakiye"] as const).forEach(key => {
        const cell = row.getCell(key);
        if (cell.value !== null && cell.value !== undefined) cell.numFmt = "#,##0.00";
      });

      const bv = Number(e.bakiye);
      row.getCell("bakiye").font = {
        color: { argb: bv > 0.005 ? "FFCA8A04" : bv < -0.005 ? "FFDC2626" : "FF16A34A" },
      };

      if (row.number % 2 === 0) {
        row.eachCell(cell => {
          if (!cell.fill || (cell.fill as any).type === "none") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F8FA" } };
          }
        });
      }
    }

    ws.addRow([]);

    const totalsRow = ws.addRow({
      tarih:      "",
      aciklama:   "DÖNEM TOPLAMI",
      tur:        "",
      borc:       kalemler.reduce((s, e) => s + e.borc,   0),
      alacak:     kalemler.reduce((s, e) => s + e.alacak, 0),
      bakiye:     kalemler.length > 0 ? kalemler[kalemler.length - 1].bakiye : 0,
      paraBirimi: bagliFirma.paraBirimi ?? "USD",
    });
    totalsRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
      cell.border = { top: { style: "thin", color: { argb: "FFCCCCCC" } } };
    });
    (["borc", "alacak", "bakiye"] as const).forEach(key => {
      totalsRow.getCell(key).numFmt = "#,##0.00";
    });

    ws.views = [{ state: "frozen", ySplit: 1 }];

    const meta = workbook.addWorksheet("Bilgi");
    meta.columns = [{ width: 22 }, { width: 32 }];
    meta.addRow(["Cari Firma",    bagliFirma.ad]);
    meta.addRow(["Dönem Başlangıç", baslangic || "Tüm Dönem"]);
    meta.addRow(["Dönem Bitiş",    bitis    || "Bugün"]);
    meta.addRow(["Oluşturma Tarihi", new Date().toLocaleDateString("tr-TR")]);

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = bagliFirma.ad.replace(/[\\/:*?"<>|]/g, "-");
    const dosyaAdi = `ekstre-${safeName}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(dosyaAdi)}"`);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("[cariler/excel] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Excel oluşturulamadı" });
  }
});

router.post("/cariler/:bagliFirmaId/send-ekstre", requireYazma, async (req, res) => {
  try {
    const bagliFirmaId = Number(req.params.bagliFirmaId);
    const { aliciEposta, mesaj, baslangic, bitis } = req.body as {
      aliciEposta: string; mesaj?: string; baslangic?: string; bitis?: string;
    };

    if (!aliciEposta?.trim()) { res.status(400).json({ error: "Alıcı e-posta adresi gerekli" }); return; }

    const [bagliFirma] = await db.select().from(firmalar).where(eq(firmalar.id, bagliFirmaId));
    if (!bagliFirma || bagliFirma.tip !== "bagli") { res.status(404).json({ error: "Cari bulunamadı" }); return; }

    const catiId = await resolveCatiFirmaId(bagliFirmaId, bagliFirma.ustFirmaId, req);
    if (!catiId) { res.status(403).json({ error: "Bu cariye erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(catiId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const [catiFirma, ayarlar] = await Promise.all([
      db.select().from(firmalar).where(eq(firmalar.id, catiId)).then(r => r[0] ?? null),
      db.select().from(firmaEpostaAyarlari).where(eq(firmaEpostaAyarlari.firmaId, catiId)).then(r => r[0] ?? null),
    ]);

    if (!ayarlar || !ayarlar.aktif || !ayarlar.smtpSifre) {
      res.status(422).json({ error: "Bu firma için aktif SMTP ayarları yapılandırılmamış" }); return;
    }

    const ps = new URLSearchParams();
    if (baslangic) ps.set("baslangic", baslangic);
    if (bitis) ps.set("bitis", bitis);
    const pdfUrl = `http://localhost:${process.env.PORT ?? 3001}/api/cariler/${bagliFirmaId}/pdf${ps.toString() ? `?${ps}` : ""}`;
    const pdfResp = await fetch(pdfUrl, { headers: { authorization: req.headers.authorization ?? "" } });
    if (!pdfResp.ok) { res.status(500).json({ error: "Ekstre PDF oluşturulamadı" }); return; }
    const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());

    const donemStr = baslangic || bitis
      ? `${baslangic || "Başlangıç"} — ${bitis || "Bugün"}`
      : "Tüm Dönem";
    const tarihStr = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
    const subject = `Cari Ekstre — ${bagliFirma.ad} (${donemStr})`;

    const logDataUrl = (catiFirma?.logo && /^data:image\//.test(catiFirma.logo)) ? catiFirma.logo : null;

    const bodyMesaj = mesaj
      ? mesaj.replace(/\n/g, "<br>")
      : `Cari hesap ekstrenizi ekte bulabilirsiniz. Dönem: <strong>${donemStr}</strong>.`;

    const html = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#000;padding:24px 32px 0 32px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border:3px solid #ffed00;background:#f8f8f5;margin:0 auto;">
      <tr><td style="padding:12px 24px;">
        ${logDataUrl
          ? `<img src="${logDataUrl}" alt="${catiFirma?.ad ?? ""}" style="max-height:50px;max-width:180px;display:block;margin:0 auto;">`
          : `<p style="margin:0;font-size:18px;font-weight:bold;color:#111;">${catiFirma?.ad ?? ""}</p>`}
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#ffed00;height:4px;font-size:4px;line-height:4px;">&nbsp;</td></tr>
  <tr><td style="background:#fff;padding:32px;">
    <p style="margin:0 0 20px;font-size:15px;color:#1a1a1a;line-height:1.6;">Sayın <strong>${bagliFirma.ad}</strong>,<br><br>${bodyMesaj}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-left:4px solid #ffed00;margin-bottom:24px;">
      <tr><td style="padding:20px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:0.8px;">CARİ HESAP EKSTRESİ</p>
        <p style="margin:0 0 12px;font-size:22px;font-weight:bold;color:#1a1a1a;">${bagliFirma.ad}</p>
        <p style="margin:0;font-size:13px;color:#555;"><strong>Dönem:</strong> ${donemStr}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#555;"><strong>Düzenleme Tarihi:</strong> ${tarihStr}</p>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffde7;border:1px solid #ffed00;margin-bottom:28px;">
      <tr><td style="padding:14px 18px;font-size:13px;color:#5a4d00;">
        Cari hesap ekstresi PDF dosyası bu e-postaya eklenmiştir.
      </td></tr>
    </table>
    <p style="margin:0 0 6px;font-size:14px;color:#1a1a1a;">Saygılarımızla,</p>
    <p style="margin:0;font-size:14px;font-weight:bold;color:#1a1a1a;">${catiFirma?.ad ?? ""}</p>
  </td></tr>
  <tr><td style="background:#1a1a1a;padding:20px 32px;">
    <p style="margin:0;font-size:12px;font-weight:bold;color:#fff;">${catiFirma?.ad ?? ""}</p>
    ${catiFirma?.adres ? `<p style="margin:4px 0 0;font-size:11px;color:#999;">${catiFirma.adres}</p>` : ""}
    ${catiFirma?.vergiNo ? `<p style="margin:4px 0 0;font-size:11px;color:#999;">Vergi No: ${catiFirma.vergiNo}</p>` : ""}
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = [
      `Sayın ${bagliFirma.ad},`,
      "",
      mesaj ?? `Cari hesap ekstrenizi ekte bulabilirsiniz. Dönem: ${donemStr}.`,
      "",
      "CARİ HESAP EKSTRESİ",
      `Cari: ${bagliFirma.ad}`,
      `Dönem: ${donemStr}`,
      `Düzenleme Tarihi: ${tarihStr}`,
      "",
      "Saygılarımızla,",
      catiFirma?.ad ?? "",
    ].join("\n");

    const guvenlik = ayarlar.smtpGuvenlik ?? "starttls";
    const transporter = nodemailer.createTransport({
      host:       ayarlar.smtpHost,
      port:       ayarlar.smtpPort ?? 587,
      secure:     guvenlik === "ssl",
      requireTLS: guvenlik === "starttls",
      auth: { user: ayarlar.smtpKullanici, pass: ayarlar.smtpSifre },
    });

    const safeName = bagliFirma.ad.replace(/[\\/:*?"<>|]/g, "-");
    const dosyaAdi = `ekstre-${safeName}.pdf`;
    await transporter.sendMail({
      from:        `"${ayarlar.gonderenAd}" <${ayarlar.gonderenAdres}>`,
      to:          aliciEposta.trim(),
      subject,
      html,
      text,
      attachments: [{ filename: dosyaAdi, content: pdfBuffer, contentType: "application/pdf" }],
    });

    await db.insert(gonderiGecmisi).values({
      kayitTipi:           "ekstre",
      kayitId:             bagliFirmaId,
      aliciEposta:         aliciEposta.trim(),
      gonderenKullaniciId: req.kullanici?.id ?? null,
      gonderenAd:          req.kullanici?.ad ?? null,
    });

    res.json({ mesaj: `Ekstre ${aliciEposta.trim()} adresine gönderildi` });
  } catch (err) {
    console.error("[cariler/send-ekstre] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "E-posta gönderilemedi" });
  }
});

router.get("/cariler/:bagliFirmaId", async (req, res) => {
  try {
    const bagliFirmaId = Number(req.params.bagliFirmaId);
    const { baslangic, bitis } = req.query as Record<string, string>;

    const [bagliFirma] = await db.select().from(firmalar).where(eq(firmalar.id, bagliFirmaId));
    if (!bagliFirma || bagliFirma.tip !== "bagli") { res.status(404).json({ error: "Cari bulunamadı" }); return; }

    const catiId = await resolveCatiFirmaId(bagliFirmaId, bagliFirma.ustFirmaId, req);
    if (!catiId) {
      res.status(403).json({ error: "Bu cariye erişim izniniz yok" }); return;
    }

    const faturaConds = [eq(faturalar.bagliFirmaId, bagliFirmaId)];
    if (baslangic) faturaConds.push(gte(faturalar.faturaTarihi, baslangic));
    if (bitis) faturaConds.push(lte(faturalar.faturaTarihi, bitis));

    const odemeConds = [eq(odemeler.bagliFirmaId, bagliFirmaId)];
    if (baslangic) odemeConds.push(gte(odemeler.tarih, baslangic));
    if (bitis) odemeConds.push(lte(odemeler.tarih, bitis));

    const [catiFirma, faturaRows, odemeRows, bankaRows] = await Promise.all([
      db.select().from(firmalar).where(eq(firmalar.id, catiId)).then(r => r[0] ?? null),
      db.select().from(faturalar).where(and(...faturaConds)),
      db.select().from(odemeler).where(and(...odemeConds)),
      db.select({ id: bankaHesaplari.id, hesapAdi: bankaHesaplari.hesapAdi, bankaAdi: bankaHesaplari.bankaAdi, paraBirimi: bankaHesaplari.paraBirimi })
        .from(bankaHesaplari).where(eq(bankaHesaplari.catiFirmaId, catiId)),
    ]);

    const kalemler = buildEntries(faturaRows, odemeRows);
    const toplamBorc = kalemler.reduce((s, e) => s + e.borc, 0);
    const toplamAlacak = kalemler.reduce((s, e) => s + e.alacak, 0);

    let oncekiBakiye: number | null = null;
    if (baslangic) {
      const [prevFaturaRows, prevOdemeRows] = await Promise.all([
        db.select().from(faturalar).where(and(
          eq(faturalar.bagliFirmaId, bagliFirmaId),
          lt(faturalar.faturaTarihi, baslangic),
        )),
        db.select().from(odemeler).where(and(
          eq(odemeler.bagliFirmaId, bagliFirmaId),
          lt(odemeler.tarih, baslangic),
        )),
      ]);
      const prevKalemler = buildEntries(prevFaturaRows, prevOdemeRows);
      oncekiBakiye = prevKalemler.length > 0
        ? prevKalemler[prevKalemler.length - 1].bakiye
        : 0;
    }

    res.json({
      firma: {
        id: bagliFirma.id,
        ad: bagliFirma.ad,
        adres: bagliFirma.adres,
        vergiNo: bagliFirma.vergiNo,
        telefon: bagliFirma.telefon,
        eposta: bagliFirma.eposta,
        paraBirimi: bagliFirma.paraBirimi,
      },
      catiFirma: catiFirma ? {
        id: catiFirma.id,
        ad: catiFirma.ad,
        adres: catiFirma.adres,
        vergiNo: catiFirma.vergiNo,
        logo: catiFirma.logo,
      } : null,
      ozet: {
        toplamBorc,
        toplamAlacak,
        bakiye: toplamBorc - toplamAlacak,
        paraBirimi: bagliFirma.paraBirimi || "USD",
      },
      kalemler,
      bankaHesaplari: bankaRows,
      oncekiBakiye,
    });
  } catch (err) {
    console.error("[cariler/detay] error:", err);
    res.status(500).json({ error: "Cari getirilemedi" });
  }
});

export default router;
