import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, firmalar, odemeler, bankaHesaplari, firmaEpostaAyarlari, gonderiGecmisi, gemiler } from "@workspace/db";
import { eq, and, inArray, gte, lte, lt } from "drizzle-orm";
import { sirketErisimKontrol, requireYazma, firmaYazmaDenetimi } from "../middleware/auth";
import { gorunurBagliFirmaIds } from "../utils/gorunurluk";
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

const DURUM_ETIKET_MAP: Record<string, string> = {
  acik: "Açık", odendi: "Ödendi", kismi_odendi: "Kısmi", taslak: "Taslak", iptal: "İptal",
};

function fmtTarih(s: string | null | undefined): string {
  if (!s) return "";
  const parts = s.split("-");
  if (parts.length !== 3) return s;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function buildEntries(faturaRows: typeof faturalar.$inferSelect[], odemeRows: typeof odemeler.$inferSelect[]) {
  const validFaturalar = faturaRows.filter(f => !["taslak", "iptal"].includes(f.durum));
  const fEntries = validFaturalar.map(f => ({
    id: `f-${f.id}`,
    tarih: f.faturaTarihi as string,
    tip: "fatura" as const,
    belgeNo: f.faturaNo as string,
    aciklama: (f.aciklama ?? f.faturaAdi ?? f.faturaNo ?? ""),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vadeTarihi: ((f as any).vadeTarihi as string | null) ?? null,
    borc: Number(f.genelToplam),
    alacak: 0,
    paraBirimi: f.paraBirimi,
    faturaId: f.id,
    durum: f.durum,
    durumEtiket: DURUM_ETIKET_MAP[f.durum] ?? f.durum,
  }));
  const oEntries = odemeRows.map(o => ({
    id: `o-${o.id}`,
    tarih: o.tarih as string,
    tip: o.tip as "tahsilat" | "odeme",
    belgeNo: null as string | null,
    aciklama: o.aciklama ?? (o.tip === "tahsilat" ? "Tahsilat" : "Ödeme"),
    vadeTarihi: null as string | null,
    borc: o.tip === "odeme" ? Number(o.tutar) : 0,
    alacak: o.tip === "tahsilat" ? Number(o.tutar) : 0,
    paraBirimi: o.paraBirimi,
    faturaId: o.faturaId ?? null,
    durum: null,
    durumEtiket: o.tip === "tahsilat" ? "Tahsilat" : "Ödeme",
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

    if (catiFirmaId && !sirketErisimKontrol(Number(catiFirmaId), req)) {
      res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return;
    }

    const isYonetici = req.kullanici?.rol === "yonetici";
    const gecerliFirmaIdleri = catiFirmaId
      ? [Number(catiFirmaId)]
      : isYonetici
        ? (await db.select({ id: firmalar.id }).from(firmalar).where(eq(firmalar.tip, "cati"))).map(f => f.id)
        : izinliSirketler;
    if (gecerliFirmaIdleri.length === 0) { res.json([]); return; }

    const allBagli = await db.select().from(firmalar).where(eq(firmalar.tip, "bagli"));

    const catiMap = new Map<number, number>();

    // gorunurBagliFirmaIds correctly handles both ustFirmaId and grupFirmaId chains
    for (const cId of gecerliFirmaIdleri) {
      const bagliFirmaIds = await gorunurBagliFirmaIds(cId);
      for (const bId of bagliFirmaIds) {
        if (!catiMap.has(bId)) catiMap.set(bId, cId);
      }
    }

    // Also discover via existing invoices (edge case: invoices linked to firms not in the chain)
    const faturaDiscover = await db
      .select({ bagliFirmaId: faturalar.bagliFirmaId, catiFirmaId: faturalar.catiFirmaId })
      .from(faturalar)
      .where(inArray(faturalar.catiFirmaId, gecerliFirmaIdleri));
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

    const gemiIdleri = [...new Set(faturaRows.map(f => f.gemiId).filter((g): g is number => g != null))];
    const gemiMap = new Map<number, string>();
    if (gemiIdleri.length > 0) {
      const gemiRows = await db.select({ id: gemiler.id, ad: gemiler.ad }).from(gemiler).where(inArray(gemiler.id, gemiIdleri));
      for (const g of gemiRows) gemiMap.set(g.id, g.ad);
    }

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

      const tumTarihler = [
        ...bFaturalar.map(f => f.faturaTarihi as string),
        ...bOdemeler.map(o => o.tarih as string),
      ].filter(Boolean).sort();
      const sonIslemTarihi = tumTarihler.length > 0 ? tumTarihler[tumTarihler.length - 1] : null;

      const allPb = new Set([
        ...validF.map(f => f.paraBirimi ?? "USD"),
        ...bOdemeler.map(o => o.paraBirimi ?? "USD"),
      ]);
      const bakiyeDetay = [...allPb].map(pb => {
        const fBorc = validF
          .filter(f => (f.paraBirimi ?? "USD") === pb)
          .reduce((s, f) => s + Number(f.genelToplam), 0);
        const oBorc = bOdemeler
          .filter(o => (o.paraBirimi ?? "USD") === pb && o.tip === "odeme")
          .reduce((s, o) => s + Number(o.tutar), 0);
        const oAlacak = bOdemeler
          .filter(o => (o.paraBirimi ?? "USD") === pb && o.tip === "tahsilat")
          .reduce((s, o) => s + Number(o.tutar), 0);
        const pbBorc = fBorc + oBorc;
        const pbAlacak = oAlacak;
        return { paraBirimi: pb, toplamBorc: pbBorc, toplamAlacak: pbAlacak, bakiye: pbBorc - pbAlacak };
      }).filter(d => d.toplamBorc > 0.005 || d.toplamAlacak > 0.005);

      const gemiIcinFaturalar = bFaturalar
        .filter(f => f.gemiId != null)
        .sort((a, b) => new Date(b.faturaTarihi as string).getTime() - new Date(a.faturaTarihi as string).getTime());
      const gemiAd = gemiIcinFaturalar.length > 0 ? (gemiMap.get(gemiIcinFaturalar[0].gemiId!) ?? null) : null;

      return {
        bagliFirmaId: bf.id,
        bagliFirmaAd: bf.ad,
        catiFirmaId: effectiveCati ?? null,
        catiFirmaAd: catiFirma?.ad ?? null,
        gemiAd,
        toplamBorc,
        toplamAlacak,
        bakiye,
        acikFaturaAdedi,
        paraBirimi: bf.paraBirimi || "USD",
        sonIslemTarihi,
        bakiyeDetay,
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

    // Dönem öncesi açılış bakiyesi
    let acilisBakiyesi = 0;
    if (baslangic) {
      const [preFatura, preOdeme] = await Promise.all([
        db.select().from(faturalar).where(and(eq(faturalar.bagliFirmaId, bagliFirmaId), lt(faturalar.faturaTarihi, baslangic))),
        db.select().from(odemeler).where(and(eq(odemeler.bagliFirmaId, bagliFirmaId), lt(odemeler.tarih, baslangic))),
      ]);
      const preEntries = buildEntries(preFatura, preOdeme);
      acilisBakiyesi = preEntries.length > 0 ? preEntries[preEntries.length - 1].bakiye : 0;
    }

    const kalemler = buildEntries(faturaRows, odemeRows);
    const toplamBorc = kalemler.reduce((s, e) => s + e.borc, 0);
    const toplamAlacak = kalemler.reduce((s, e) => s + e.alacak, 0);
    const paraBirimi = bagliFirma.paraBirimi || "USD";
    const kapanisBakiyesi = acilisBakiyesi + toplamBorc - toplamAlacak;

    const pbSummaryMap = new Map<string, { toplamBorc: number; toplamAlacak: number }>();
    for (const e of kalemler) {
      const pb = e.paraBirimi ?? "USD";
      const cur = pbSummaryMap.get(pb) ?? { toplamBorc: 0, toplamAlacak: 0 };
      cur.toplamBorc += e.borc;
      cur.toplamAlacak += e.alacak;
      pbSummaryMap.set(pb, cur);
    }
    const pbSummaries = [...pbSummaryMap.entries()]
      .map(([pb, { toplamBorc: pbBorc, toplamAlacak: pbAlacak }]) => ({
        paraBirimi: pb,
        toplamBorc: pbBorc,
        toplamAlacak: pbAlacak,
        bakiye: pbBorc - pbAlacak,
      }))
      .filter(s => s.toplamBorc > 0.005 || s.toplamAlacak > 0.005);
    const isMultiCurrency = pbSummaries.length > 1;

    const fmt = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const donemStr = baslangic || bitis
      ? `${baslangic ? fmtTarih(baslangic) : "Başlangıç"} - ${bitis ? fmtTarih(bitis) : "Bugün"}`
      : "Tüm Dönem";
    const tarihStr = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });

    const DURUM_C: Record<string, string> = {
      acik: "#d97706", odendi: "#16a34a", kismi_odendi: "#2563eb",
      tahsilat: "#16a34a", odeme: "#6366f1",
    };
    const dataRows = kalemler.map(e => {
      const kBakiye = acilisBakiyesi + e.bakiye;
      const bakiyeRenk = kBakiye > 0.005 ? "#d97706" : kBakiye < -0.005 ? "#dc2626" : "#16a34a";
      const durumRenk = e.tip === "fatura" ? (DURUM_C[e.durum ?? ""] ?? "#374151") : (DURUM_C[e.tip] ?? "#374151");
      return [
        { text: fmtTarih(e.tarih), fontSize: 7.5, color: "#374151" },
        { text: e.belgeNo ?? "", fontSize: 7.5, color: "#1d4ed8" },
        { text: e.aciklama, fontSize: 8 },
        { text: fmtTarih(e.vadeTarihi), fontSize: 7.5, color: "#6b7280" },
        { text: e.borc > 0 ? fmt(e.borc) : "", alignment: "right", fontSize: 8 },
        { text: e.alacak > 0 ? fmt(e.alacak) : "", alignment: "right", fontSize: 8, color: "#16a34a" },
        { text: fmt(Math.abs(kBakiye)), alignment: "right", fontSize: 8, bold: true, color: bakiyeRenk },
        { text: e.durumEtiket, fontSize: 7, color: durumRenk, alignment: "center" },
      ];
    });

    // Özet kutusu satırları
    const nb: [boolean, boolean, boolean, boolean] = [false, false, false, false];
    const bt: [boolean, boolean, boolean, boolean] = [false, true, false, false];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summaryBody: any[][] = isMultiCurrency
      ? [
          [{ text: "ÖZET", colSpan: 2, bold: true, fontSize: 7, color: "#6b7280", characterSpacing: 1, fillColor: "#f3f4f6", border: nb, marginTop: 3, marginBottom: 3 }, {}],
          ...pbSummaries.flatMap(s => [
            [{ text: s.paraBirimi, bold: true, fontSize: 8, color: "#111827", colSpan: 2, border: nb, marginTop: 4 }, {}],
            [{ text: "Toplam Borç", fontSize: 8, border: nb }, { text: fmt(s.toplamBorc), alignment: "right", fontSize: 8, bold: true, border: nb }],
            [{ text: "Toplam Alacak", fontSize: 8, color: "#16a34a", border: nb }, { text: fmt(s.toplamAlacak), alignment: "right", fontSize: 8, bold: true, color: "#16a34a", border: nb }],
            [{ text: "Kapanış Bakiyesi", fontSize: 8, bold: true, color: s.bakiye > 0.005 ? "#d97706" : "#16a34a", border: bt }, { text: `${fmt(Math.abs(s.bakiye))} ${s.paraBirimi}`, alignment: "right", fontSize: 8, bold: true, color: s.bakiye > 0.005 ? "#d97706" : "#16a34a", border: bt }],
          ]),
        ]
      : [
          [{ text: "ÖZET", colSpan: 2, bold: true, fontSize: 7, color: "#6b7280", characterSpacing: 1, fillColor: "#f3f4f6", border: nb, marginTop: 3, marginBottom: 3 }, {}],
          [{ text: "Açılış Bakiyesi", fontSize: 8, border: nb }, { text: `${fmt(acilisBakiyesi)} ${paraBirimi}`, alignment: "right", fontSize: 8, bold: true, border: nb }],
          [{ text: "Toplam Borç", fontSize: 8, border: nb }, { text: `${fmt(toplamBorc)} ${paraBirimi}`, alignment: "right", fontSize: 8, bold: true, border: nb }],
          [{ text: "Toplam Alacak", fontSize: 8, color: "#16a34a", border: nb }, { text: `${fmt(toplamAlacak)} ${paraBirimi}`, alignment: "right", fontSize: 8, bold: true, color: "#16a34a", border: nb }],
          [{ text: "Kapanış Bakiyesi", fontSize: 8, bold: true, color: kapanisBakiyesi > 0.005 ? "#d97706" : "#16a34a", border: bt }, { text: `${fmt(Math.abs(kapanisBakiyesi))} ${paraBirimi}`, alignment: "right", fontSize: 8, bold: true, color: kapanisBakiyesi > 0.005 ? "#d97706" : "#16a34a", border: bt }],
        ];

    const docDefinition: TDocumentDefinitions = {
      defaultStyle: { font: "Roboto", fontSize: 9 },
      pageMargins: [36, 50, 36, 50],
      content: [
        // Başlık: sol sütun beyaz (logo), sağ sütun koyu (başlık yazısı)
        {
          table: {
            widths: [130, "*"],
            body: [[
              catiFirma?.logo
                ? {
                    image: catiFirma.logo,
                    width: 110,
                    alignment: "center" as const,
                    fillColor: "#ffffff",
                    border: [false, false, true, false] as [boolean, boolean, boolean, boolean],
                    margin: [8, 6, 8, 6],
                  }
                : {
                    text: catiFirma?.ad ?? "",
                    fontSize: 11, bold: true, color: "#ffffff",
                    fillColor: "#111827",
                    border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                    margin: [10, 13, 0, 0],
                  },
              {
                text: "CARİ HESAP EKSTRESİ",
                fontSize: 13, bold: true, color: "#facc15",
                fillColor: "#111827",
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                alignment: "right" as const,
                margin: [0, 13, 10, 0],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i: number) => (i === 1 ? 2 : 0),
            vLineColor: () => "#1c3c6e",
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0,
          },
          marginBottom: 16,
        },
        // Bilgi ve özet sütunları
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "MÜŞTERİ", fontSize: 7, bold: true, color: "#6b7280", characterSpacing: 1, marginBottom: 5 },
                { text: bagliFirma.ad, bold: true, fontSize: 12, color: "#111827", marginBottom: 2 },
                ...(bagliFirma.adres ? [{ text: bagliFirma.adres, color: "#6b7280", fontSize: 7.5, marginBottom: 1.5 }] : []),
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5, lineColor: "#e5e7eb" }], marginTop: 7, marginBottom: 7 },
                { text: `Ekstre Tarihi: ${tarihStr}`, color: "#374151", fontSize: 7.5, marginBottom: 2 },
                { text: `Dönem: ${donemStr}`, color: "#374151", fontSize: 7.5, marginBottom: 2 },
                { text: `Para Birimi: ${isMultiCurrency ? "Çoklu Para Birimi" : paraBirimi}`, color: "#374151", fontSize: 7.5, marginBottom: 2 },
                { text: `Hazırlayan: ${catiFirma?.ad ?? ""}`, color: "#111827", fontSize: 7.5, bold: true },
              ],
            },
            {
              width: 205,
              table: {
                widths: ["*", "auto"],
                body: summaryBody,
              },
              layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                hLineColor: () => "#e5e7eb",
                paddingLeft: () => 8,
                paddingRight: () => 8,
                paddingTop: () => 5,
                paddingBottom: () => 5,
              },
            },
          ],
          marginBottom: 16,
        },
        // Hareket tablosu
        kalemler.length > 0
          ? {
              table: {
                headerRows: 1,
                widths: [46, 68, "*", 46, 60, 60, 66, 46],
                body: [
                  [
                    { text: "TARİH", style: "thStyle" },
                    { text: "BELGE NO", style: "thStyle" },
                    { text: "AÇIKLAMA", style: "thStyle" },
                    { text: "VADE", style: "thStyle", alignment: "center" },
                    { text: "BORÇ", style: "thStyle", alignment: "right" },
                    { text: "ALACAK", style: "thStyle", alignment: "right" },
                    { text: "BAKİYE", style: "thStyle", alignment: "right" },
                    { text: "DURUM", style: "thStyle", alignment: "center" },
                  ],
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ...dataRows as any,
                ],
              },
              layout: {
                hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
                  i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
                vLineWidth: () => 0,
                hLineColor: (i: number) => (i === 0 || i === 1 ? "#111827" : "#e5e7eb"),
                fillColor: (i: number) => (i === 0 ? "#111827" : i % 2 === 0 ? "#f9fafb" : null),
                paddingTop: () => 5,
                paddingBottom: () => 5,
                paddingLeft: () => 6,
                paddingRight: () => 6,
              },
            } as unknown as import("pdfmake/interfaces").Content
          : { text: "Bu dönemde kayıt bulunamadı.", color: "#888", italics: true, marginTop: 8 } as import("pdfmake/interfaces").Content,
        // Footer
        {
          text: `Bu ekstre ${tarihStr} tarihinde ${catiFirma?.ad ?? ""} tarafından düzenlenmiştir.`,
          fontSize: 7, color: "#9ca3af", italics: true, marginTop: 24, alignment: "center",
        },
      ],
      styles: {
        thStyle: { bold: true, color: "#ffffff", fontSize: 7.5, characterSpacing: 0.3 },
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

    const [catiFirma] = await db.select().from(firmalar).where(eq(firmalar.id, catiId));

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

    // Dönem öncesi açılış bakiyesi
    let acilisBakiyesi = 0;
    if (baslangic) {
      const [preFatura, preOdeme] = await Promise.all([
        db.select().from(faturalar).where(and(eq(faturalar.bagliFirmaId, bagliFirmaId), lt(faturalar.faturaTarihi, baslangic))),
        db.select().from(odemeler).where(and(eq(odemeler.bagliFirmaId, bagliFirmaId), lt(odemeler.tarih, baslangic))),
      ]);
      const preEntries = buildEntries(preFatura, preOdeme);
      acilisBakiyesi = preEntries.length > 0 ? preEntries[preEntries.length - 1].bakiye : 0;
    }

    const kalemler = buildEntries(faturaRows, odemeRows);
    const toplamBorc   = kalemler.reduce((s, e) => s + e.borc,   0);
    const toplamAlacak = kalemler.reduce((s, e) => s + e.alacak, 0);
    const kapanisBakiyesi = acilisBakiyesi + toplamBorc - toplamAlacak;
    const paraBirimi = bagliFirma.paraBirimi ?? "USD";
    const donemStr = baslangic || bitis
      ? `${baslangic ? fmtTarih(baslangic) : "Başlangıç"} / ${bitis ? fmtTarih(bitis) : "Bugün"}`
      : "Tüm Dönem";
    const fmt = (n: number) => n.toFixed(2);

    // === Workbook ===
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "TOOV";
    workbook.created = new Date();
    const ws = workbook.addWorksheet("Ekstre");

    // Sütun genişlikleri (8 sütun: A-H)
    ws.columns = [
      { key: "tarih",      width: 24 },  // A
      { key: "belgeNo",    width: 18 },  // B
      { key: "aciklama",   width: 38 },  // C
      { key: "vadeTarihi", width: 13 },  // D
      { key: "borc",       width: 14 },  // E
      { key: "alacak",     width: 14 },  // F
      { key: "bakiye",     width: 15 },  // G
      { key: "durum",      width: 13 },  // H
    ];

    const NAVY  = "FF1C3C6E";
    const WHITE = "FFFFFFFF";
    const LIGHT_BLUE = "FFBDD7EE";

    const solidFill = (argb: string): ExcelJS.Fill =>
      ({ type: "pattern", pattern: "solid", fgColor: { argb } });

    // --- Satır 1: Başlık ---
    ws.mergeCells("A1:H1");
    const r1 = ws.getRow(1);
    r1.height = 30;
    const titleCell = ws.getCell("A1");
    titleCell.value = "CARİ HESAP EKSTRESİ";
    titleCell.font  = { bold: true, color: { argb: WHITE }, size: 14 };
    titleCell.fill  = solidFill(NAVY);
    titleCell.alignment = { vertical: "middle", horizontal: "center" };

    // --- Satır 2: boş ---
    ws.getRow(2).height = 8;

    // --- Satır 3: Firma/Müşteri + ÖZET başlık ---
    ws.getRow(3).height = 18;
    const setLabel = (addr: string, text: string) => {
      const c = ws.getCell(addr);
      c.value = text;
      c.font  = { bold: true };
    };
    setLabel("A3", "Firma / Müşteri");
    ws.getCell("B3").value = bagliFirma.ad;
    ws.mergeCells("G3:H3");
    const ozetCell = ws.getCell("G3");
    ozetCell.value = "ÖZET";
    ozetCell.font  = { bold: true, color: { argb: WHITE }, size: 11 };
    ozetCell.fill  = solidFill(NAVY);
    ozetCell.alignment = { vertical: "middle", horizontal: "center" };

    // --- Satır 4: Ekstre Tarih Aralığı + Açılış Bakiyesi ---
    ws.getRow(4).height = 16;
    setLabel("A4", "Ekstre Tarih Aralığı");
    ws.getCell("B4").value = donemStr;
    setLabel("G4", "Açılış Bakiyesi");
    ws.getCell("H4").value = fmt(acilisBakiyesi);
    ws.getCell("H4").alignment = { horizontal: "right" };

    // --- Satır 5: Para Birimi + Toplam Borç ---
    ws.getRow(5).height = 16;
    setLabel("A5", "Para Birimi");
    ws.getCell("B5").value = paraBirimi;
    setLabel("G5", "Toplam Borç");
    ws.getCell("H5").value = fmt(toplamBorc);
    ws.getCell("H5").alignment = { horizontal: "right" };

    // --- Satır 6: Hazırlayan + Toplam Alacak ---
    ws.getRow(6).height = 16;
    setLabel("A6", "Hazırlayan");
    ws.getCell("B6").value = catiFirma?.ad ?? "";
    setLabel("G6", "Toplam Alacak");
    ws.getCell("H6").value = fmt(toplamAlacak);
    ws.getCell("H6").alignment = { horizontal: "right" };

    // --- Satır 7: Kapanış Bakiyesi ---
    ws.getRow(7).height = 16;
    setLabel("G7", "Kapanış Bakiyesi");
    ws.getCell("H7").value = fmt(kapanisBakiyesi);
    ws.getCell("H7").alignment = { horizontal: "right" };
    ws.getCell("H7").font = { bold: true };

    // --- Satır 8: boş ---
    ws.getRow(8).height = 10;

    // --- Satır 9: Kolon başlıkları ---
    const hdrRow = ws.getRow(9);
    hdrRow.height = 22;
    for (let c = 1; c <= 8; c++) {
      const cell = hdrRow.getCell(c);
      cell.value = ["Tarih", "Belge No", "Açıklama", "Vade Tarihi", "Borç", "Alacak", "Bakiye", "Durum"][c - 1];
      cell.font  = { bold: true, color: { argb: WHITE }, size: 10 };
      cell.fill  = solidFill(NAVY);
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }

    // Freeze rows 1–9 so header stays visible when scrolling
    ws.views = [{ state: "frozen", ySplit: 9 }];

    // --- Satır 10+: Veri satırları ---
    for (let i = 0; i < kalemler.length; i++) {
      const e = kalemler[i];
      const row = ws.getRow(10 + i);
      row.height = 16;

      row.getCell(1).value = fmtTarih(e.tarih);
      row.getCell(2).value = e.belgeNo ?? "";
      row.getCell(3).value = e.aciklama;
      row.getCell(4).value = fmtTarih(e.vadeTarihi);
      row.getCell(5).value = e.borc   > 0.005 ? e.borc   : null;
      row.getCell(6).value = e.alacak > 0.005 ? e.alacak : null;
      row.getCell(7).value = e.bakiye;
      row.getCell(8).value = e.durumEtiket;

      // Sayı formatı
      [5, 6, 7].forEach(col => {
        const cell = row.getCell(col);
        if (cell.value !== null && cell.value !== undefined) cell.numFmt = "#,##0.00";
      });

      // Bakiye rengi
      const bv = Number(e.bakiye);
      const bakiyeArgb = bv > 0.005 ? "FFCA8A04" : bv < -0.005 ? "FFDC2626" : "FF16A34A";
      row.getCell(7).font = { color: { argb: bakiyeArgb } };

      // Çizgili arka plan (her çift satır açık mavi)
      if (i % 2 === 0) {
        for (let c = 1; c <= 8; c++) {
          row.getCell(c).fill = solidFill(LIGHT_BLUE);
        }
        // Bakiye font'unu yeniden uygula (fill'den sonra kaybolabilir)
        row.getCell(7).font = { color: { argb: bakiyeArgb } };
      }
    }

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

    const validDetayF = faturaRows.filter(f => !["taslak", "iptal"].includes(f.durum));
    const allDetayPb = new Set([
      ...validDetayF.map(f => f.paraBirimi ?? "USD"),
      ...odemeRows.map(o => o.paraBirimi ?? "USD"),
    ]);
    const bakiyeDetay = [...allDetayPb].map(pb => {
      const fBorc = validDetayF
        .filter(f => (f.paraBirimi ?? "USD") === pb)
        .reduce((s, f) => s + Number(f.genelToplam), 0);
      const oBorc = odemeRows
        .filter(o => (o.paraBirimi ?? "USD") === pb && o.tip === "odeme")
        .reduce((s, o) => s + Number(o.tutar), 0);
      const oAlacak = odemeRows
        .filter(o => (o.paraBirimi ?? "USD") === pb && o.tip === "tahsilat")
        .reduce((s, o) => s + Number(o.tutar), 0);
      const pbBorc = fBorc + oBorc;
      const pbAlacak = oAlacak;
      return { paraBirimi: pb, toplamBorc: pbBorc, toplamAlacak: pbAlacak, bakiye: pbBorc - pbAlacak };
    }).filter(d => d.toplamBorc > 0.005 || d.toplamAlacak > 0.005);

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
      bakiyeDetay,
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
