import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, firmalar, odemeler, bankaHesaplari } from "@workspace/db";
import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { sirketErisimKontrol } from "../middleware/auth";
import { createRequire } from "node:module";
import path from "node:path";
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

async function effectiveCatiFirmaId(bagliFirmaId: number, ustFirmaId: number | null): Promise<number | null> {
  if (ustFirmaId) return ustFirmaId;
  const rows = await db
    .select({ catiFirmaId: faturalar.catiFirmaId })
    .from(faturalar)
    .where(eq(faturalar.bagliFirmaId, bagliFirmaId))
    .limit(1);
  return rows[0]?.catiFirmaId ?? null;
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

    const catiId = await effectiveCatiFirmaId(bagliFirmaId, bagliFirma.ustFirmaId);
    if (!catiId || !sirketErisimKontrol(catiId, req)) {
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

router.get("/cariler/:bagliFirmaId", async (req, res) => {
  try {
    const bagliFirmaId = Number(req.params.bagliFirmaId);
    const { baslangic, bitis } = req.query as Record<string, string>;

    const [bagliFirma] = await db.select().from(firmalar).where(eq(firmalar.id, bagliFirmaId));
    if (!bagliFirma || bagliFirma.tip !== "bagli") { res.status(404).json({ error: "Cari bulunamadı" }); return; }

    const catiId = await effectiveCatiFirmaId(bagliFirmaId, bagliFirma.ustFirmaId);
    if (!catiId || !sirketErisimKontrol(catiId, req)) {
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
    });
  } catch (err) {
    console.error("[cariler/detay] error:", err);
    res.status(500).json({ error: "Cari getirilemedi" });
  }
});

export default router;
