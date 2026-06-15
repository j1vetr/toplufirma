import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, faturaKalemleri, firmalar, gemiler, odemeler, faturaSerileri, bankaHesaplari, firmaEpostaAyarlari } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { createRequire } from "node:module";
import path from "node:path";
import type { TDocumentDefinitions, TableCell } from "pdfmake/interfaces";

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

router.get("/faturalar", async (req, res) => {
  try {
    const { catiFirmaId, bagliFirmaId, durum, paraBirimi, baslangicTarihi, bitisTarihi } = req.query as Record<string, string>;

    let rows = await db
      .select({ f: faturalar, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad })
      .from(faturalar)
      .leftJoin(firmalar, eq(faturalar.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .orderBy(faturalar.faturaTarihi);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, catiFirmaId: r.f.catiFirmaId })),
      req, catiFirmaId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    rows = rows.filter(r => scoped.some(s => s.f.id === r.f.id));

    if (bagliFirmaId) rows = rows.filter(r => r.f.bagliFirmaId === Number(bagliFirmaId));
    if (durum) rows = rows.filter(r => r.f.durum === durum);
    if (paraBirimi) rows = rows.filter(r => r.f.paraBirimi === paraBirimi);
    if (baslangicTarihi) rows = rows.filter(r => r.f.faturaTarihi >= baslangicTarihi);
    if (bitisTarihi) rows = rows.filter(r => r.f.faturaTarihi <= bitisTarihi);

    const bagliAds = await bagliAdlariGetir();
    const odenenler = await hesaplaOdenenler();
    res.json(rows.map(r => formatFatura(r.f, r.catiFirmaAd, bagliAds[r.f.bagliFirmaId ?? 0], r.gemiAd, odenenler[r.f.id] ?? 0)));
  } catch {
    res.status(500).json({ error: "Faturalar listelenemedi" });
  }
});

router.post("/faturalar", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, bagliFirmaId, gemiId, faturaSerisiId, faturaTarihi, vadeTarihi, paraBirimi, notlar, aciklama, kalemler } = req.body;
    if (!catiFirmaId || !bagliFirmaId || !faturaTarihi || !vadeTarihi || !kalemler?.length) {
      res.status(400).json({ error: "Zorunlu alanlar eksik" }); return;
    }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const [bagliFirma] = await db.select({ uid: firmalar.ustFirmaId }).from(firmalar).where(eq(firmalar.id, Number(bagliFirmaId)));
    if (!bagliFirma || bagliFirma.uid !== Number(catiFirmaId)) { res.status(400).json({ error: "Belirtilen bağlı firma bu çatı firmaya ait değil" }); return; }

    if (gemiId) {
      const [gemiRow] = await db.select({ uid: firmalar.ustFirmaId })
        .from(gemiler).leftJoin(firmalar, eq(gemiler.firmaId, firmalar.id))
        .where(eq(gemiler.id, Number(gemiId)));
      if (!gemiRow || gemiRow.uid !== Number(catiFirmaId)) { res.status(400).json({ error: "Belirtilen gemi bu firmaya ait değil" }); return; }
    }

    let faturaNo = "";
    if (faturaSerisiId) {
      const [seri] = await db.select().from(faturaSerileri).where(eq(faturaSerileri.id, faturaSerisiId));
      if (!seri || seri.catiFirmaId !== Number(catiFirmaId)) {
        res.status(400).json({ error: "Belirtilen fatura serisi bu firmaya ait değil" }); return;
      }
      faturaNo = `${seri.onek}${String(seri.sonrakiNo).padStart(6, "0")}`;
      await db.update(faturaSerileri).set({ sonrakiNo: seri.sonrakiNo + 1 }).where(eq(faturaSerileri.id, seri.id));
    }
    if (!faturaNo) {
      const [catiFirma] = await db.select().from(firmalar).where(eq(firmalar.id, catiFirmaId));
      const prefix = catiFirma?.seriOneki ?? "FAT";
      const [count] = await db.select({ n: sql<number>`count(*)` }).from(faturalar).where(eq(faturalar.catiFirmaId, catiFirmaId));
      faturaNo = `${prefix}${String((Number(count?.n ?? 0) + 1)).padStart(6, "0")}`;
    }

    let toplamTutar = 0, kdvTutari = 0;
    const kalemRows = [];
    for (const k of kalemler as { aciklama: string; miktar: number; birimFiyat: number; kdvOrani: number }[]) {
      const ara = k.miktar * k.birimFiyat;
      const kdv = ara * (k.kdvOrani / 100);
      toplamTutar += ara; kdvTutari += kdv;
      kalemRows.push({ aciklama: k.aciklama, miktar: String(k.miktar), birimFiyat: String(k.birimFiyat), kdvOrani: String(k.kdvOrani), araToplam: String(ara), kdvTutari: String(kdv), genelToplam: String(ara + kdv) });
    }

    const [fatura] = await db.insert(faturalar).values({
      catiFirmaId, bagliFirmaId, gemiId: gemiId ?? null, faturaSerisiId: faturaSerisiId ?? null,
      faturaNo, faturaTarihi, vadeTarihi, paraBirimi: paraBirimi ?? "USD",
      durum: "acik", toplamTutar: String(toplamTutar), kdvTutari: String(kdvTutari),
      genelToplam: String(toplamTutar + kdvTutari), notlar, aciklama,
    }).returning();

    for (const k of kalemRows) {
      await db.insert(faturaKalemleri).values({ faturaId: fatura.id, ...k });
    }

    res.status(201).json(formatFatura(fatura, null, null, null, 0));
  } catch {
    res.status(500).json({ error: "Fatura oluşturulamadı" });
  }
});

router.get("/faturalar/excel", async (req, res) => {
  try {
    const { catiFirmaId } = req.query as Record<string, string>;
    if (catiFirmaId && !sirketErisimKontrol(Number(catiFirmaId), req)) {
      res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return;
    }

    let rows = await db
      .select({ f: faturalar, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad })
      .from(faturalar)
      .leftJoin(firmalar, eq(faturalar.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .orderBy(faturalar.faturaTarihi);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, catiFirmaId: r.f.catiFirmaId })), req, catiFirmaId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    rows = rows.filter(r => scoped.some(s => s.f.id === r.f.id));

    const bagliAds = await bagliAdlariGetir();

    const wb = new ExcelJS.Workbook();
    wb.creator = "Muhasebe Paneli";
    const ws = wb.addWorksheet("Faturalar");
    ws.columns = [
      { header: "Fatura No", key: "faturaNo", width: 16 },
      { header: "Çatı Firma", key: "catiFirmaAd", width: 28 },
      { header: "Cari / Bağlı Firma", key: "bagliFirmaAd", width: 28 },
      { header: "Gemi", key: "gemiAd", width: 20 },
      { header: "Fatura Tarihi", key: "faturaTarihi", width: 14 },
      { header: "Vade Tarihi", key: "vadeTarihi", width: 14 },
      { header: "Para Birimi", key: "paraBirimi", width: 12 },
      { header: "Toplam Tutar", key: "toplamTutar", width: 14 },
      { header: "KDV", key: "kdvTutari", width: 12 },
      { header: "Genel Toplam", key: "genelToplam", width: 14 },
      { header: "Durum", key: "durum", width: 14 },
      { header: "Açıklama", key: "aciklama", width: 40 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0070D1" } };

    for (const r of rows) {
      ws.addRow({
        faturaNo: r.f.faturaNo, catiFirmaAd: r.catiFirmaAd,
        bagliFirmaAd: bagliAds[r.f.bagliFirmaId ?? 0] ?? null,
        gemiAd: r.gemiAd, faturaTarihi: r.f.faturaTarihi, vadeTarihi: r.f.vadeTarihi,
        paraBirimi: r.f.paraBirimi, toplamTutar: Number(r.f.toplamTutar),
        kdvTutari: Number(r.f.kdvTutari), genelToplam: Number(r.f.genelToplam),
        durum: r.f.durum, aciklama: r.f.aciklama,
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"faturalar.xlsx\"");
    await wb.xlsx.write(res);
    res.end();
  } catch {
    res.status(500).json({ error: "Excel export başarısız" });
  }
});

router.get("/faturalar/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ f: faturalar, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad })
      .from(faturalar)
      .leftJoin(firmalar, eq(faturalar.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .where(eq(faturalar.id, id));
    if (!row) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.f.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const bagliFirmaAd = row.f.bagliFirmaId ? (await db.select({ ad: firmalar.ad }).from(firmalar).where(eq(firmalar.id, row.f.bagliFirmaId)))[0]?.ad ?? null : null;
    const kalemler = await db.select().from(faturaKalemleri).where(eq(faturaKalemleri.faturaId, id));
    const ods = await db.select().from(odemeler).where(eq(odemeler.faturaId, id));
    const odenen = ods.filter(o => o.tip === "tahsilat").reduce((s, o) => s + Number(o.tutar), 0);

    res.json({
      ...formatFatura(row.f, row.catiFirmaAd, bagliFirmaAd, row.gemiAd, odenen),
      kalemler: kalemler.map(k => ({
        id: k.id, faturaId: k.faturaId, aciklama: k.aciklama,
        miktar: Number(k.miktar), birimFiyat: Number(k.birimFiyat),
        kdvOrani: Number(k.kdvOrani), araToplam: Number(k.araToplam),
        kdvTutari: Number(k.kdvTutari), genelToplam: Number(k.genelToplam),
      })),
      odemeler: ods.map(o => ({
        id: o.id, catiFirmaId: o.catiFirmaId, bagliFirmaId: o.bagliFirmaId, faturaId: o.faturaId,
        tip: o.tip, tarih: o.tarih, tutar: Number(o.tutar), paraBirimi: o.paraBirimi,
        odemeYontemi: o.odemeYontemi, aciklama: o.aciklama, olusturmaTarihi: o.olusturmaTarihi,
        catiFirmaAd: null, bagliFirmaAd: null, gemiId: o.gemiId, gemiAd: null,
        bankaHesabiId: o.bankaHesabiId, bankaHesabiAd: null, faturaNo: row.f.faturaNo,
      })),
    });
  } catch {
    res.status(500).json({ error: "Fatura getirilemedi" });
  }
});

router.get("/faturalar/:id/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ f: faturalar, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad })
      .from(faturalar)
      .leftJoin(firmalar, eq(faturalar.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .where(eq(faturalar.id, id));
    if (!row) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.f.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const [catiFirmaRow] = await db.select().from(firmalar).where(eq(firmalar.id, row.f.catiFirmaId));
    const bagliFirmaAd = row.f.bagliFirmaId ? (await db.select({ ad: firmalar.ad }).from(firmalar).where(eq(firmalar.id, row.f.bagliFirmaId)))[0]?.ad ?? null : null;
    const kalemler = await db.select().from(faturaKalemleri).where(eq(faturaKalemleri.faturaId, id));
    const ods = await db.select().from(odemeler).where(eq(odemeler.faturaId, id));
    const odenen = ods.filter(o => o.tip === "tahsilat").reduce((s, o) => s + Number(o.tutar), 0);
    const bankalar = await db.select().from(bankaHesaplari).where(eq(bankaHesaplari.catiFirmaId, row.f.catiFirmaId));
    const f = row.f;

    const durumEtiket = f.durum === "odendi" ? "ÖDENDİ" : f.durum === "acik" ? "ÖDENMEDİ" : "KISMİ ÖDENDİ";
    const kalan = Math.max(0, Number(f.genelToplam) - odenen);

    const paraBirimiSiralama = ["TRY", "USD", "EUR", "GBP"];
    const bankalarGruplu = bankalar.reduce<Record<string, typeof bankalar>>((acc, b) => {
      (acc[b.paraBirimi] ??= []).push(b);
      return acc;
    }, {});
    const paraBirimleri = [
      ...paraBirimiSiralama.filter(pb => bankalarGruplu[pb]),
      ...Object.keys(bankalarGruplu).filter(pb => !paraBirimiSiralama.includes(pb)),
    ];
    const bankaBilgileri = paraBirimleri.map(pb =>
      `— ${pb} HESAPLARI —\n` + bankalarGruplu[pb].map(b =>
        `${b.bankaAdi}: ${b.hesapAdi}${b.iban ? `\nIBAN: ${b.iban}` : ""}`
      ).join("\n")
    ).join("\n\n");

    const docDefinition: TDocumentDefinitions = {
      defaultStyle: { font: "Roboto", fontSize: 10 },
      pageMargins: [40, 60, 40, 60],
      content: [
        {
          columns: [
            {
              stack: [
                ...(catiFirmaRow?.logo ? [{ image: catiFirmaRow.logo, width: 80, marginBottom: 4 }] : []),
                { text: catiFirmaRow?.ad ?? row.catiFirmaAd ?? "", style: "sirketAd" },
                ...(catiFirmaRow?.adres ? [{ text: catiFirmaRow.adres, color: "#555", fontSize: 9, marginTop: 2 }] : []),
                ...(catiFirmaRow?.vergiNo ? [{ text: `Vergi No: ${catiFirmaRow.vergiNo}${catiFirmaRow.vergiDairesi ? ` — ${catiFirmaRow.vergiDairesi}` : ""}`, color: "#555", fontSize: 9, marginTop: 1 }] : []),
              ],
              width: "*",
            },
            { text: ["FATURA\n", { text: f.faturaNo, fontSize: 14, bold: true }], style: "faturaBaslik", alignment: "right", width: "auto" },
          ],
          marginBottom: 16,
        },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: "#0070d1" }], marginBottom: 16 },
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "MÜŞTERİ BİLGİLERİ", style: "bolumBaslik" },
                { text: bagliFirmaAd ?? "-", bold: true, marginTop: 4 },
                ...(row.gemiAd ? [{ text: `Gemi: ${row.gemiAd}`, color: "#555", marginTop: 2 }] : []),
              ],
            },
            {
              width: "*",
              stack: [
                { text: "FATURA DETAYLARI", style: "bolumBaslik" },
                { text: `Fatura Tarihi: ${f.faturaTarihi}`, marginTop: 4 },
                { text: `Vade Tarihi: ${f.vadeTarihi}`, marginTop: 2 },
                { text: `Para Birimi: ${f.paraBirimi}`, marginTop: 2 },
                { text: `Durum: ${durumEtiket}`, marginTop: 4, bold: true, color: f.durum === "odendi" ? "#16a34a" : f.durum === "acik" ? "#dc2626" : "#d97706" },
              ],
              alignment: "right",
            },
          ],
          marginBottom: 20,
        },
        {
          table: {
            headerRows: 1,
            widths: ["*", 55, 70, 40, 70],
            body: ([
              [
                { text: "Açıklama", style: "tabloBaslik" },
                { text: "Miktar", style: "tabloBaslik", alignment: "right" },
                { text: "Birim Fiyat", style: "tabloBaslik", alignment: "right" },
                { text: "KDV %", style: "tabloBaslik", alignment: "right" },
                { text: "Toplam", style: "tabloBaslik", alignment: "right" },
              ],
              ...kalemler.map(k => [
                { text: k.aciklama },
                { text: Number(k.miktar).toFixed(2), alignment: "right" },
                { text: Number(k.birimFiyat).toFixed(2), alignment: "right" },
                { text: `%${Number(k.kdvOrani).toFixed(0)}`, alignment: "right" },
                { text: Number(k.genelToplam).toFixed(2), alignment: "right" },
              ]),
            ] as unknown as TableCell[][]),
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
            vLineWidth: () => 0,
            hLineColor: (i: number) => (i === 0 || i === 1 ? "#0070d1" : "#e8eaf0"),
            fillColor: (i: number) => (i === 0 ? "#0070d1" : i % 2 === 0 ? "#f9fafc" : null),
          },
          marginBottom: 16,
        },
        {
          columns: [
            { width: "*", text: "" },
            {
              width: 240,
              table: {
                widths: ["*", "auto"],
                body: [
                  [{ text: "Ara Toplam:", color: "#555" }, { text: `${Number(f.toplamTutar).toFixed(2)} ${f.paraBirimi}`, alignment: "right" }],
                  [{ text: "KDV Tutarı:", color: "#555" }, { text: `${Number(f.kdvTutari).toFixed(2)} ${f.paraBirimi}`, alignment: "right" }],
                  [{ text: "Genel Toplam:", bold: true }, { text: `${Number(f.genelToplam).toFixed(2)} ${f.paraBirimi}`, alignment: "right", bold: true }],
                  [{ text: "Ödenen:", color: "#555" }, { text: `${odenen.toFixed(2)} ${f.paraBirimi}`, alignment: "right" }],
                  [
                    { text: "KALAN BORÇ:", bold: true, fontSize: 12, color: "#0070d1" },
                    { text: `${kalan.toFixed(2)} ${f.paraBirimi}`, alignment: "right", bold: true, fontSize: 12, color: "#0070d1" },
                  ],
                ],
              },
              layout: {
                hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === node.table.body.length - 1 ? 2 : i === node.table.body.length ? 1 : 0),
                vLineWidth: () => 0,
                hLineColor: () => "#0070d1",
              },
            },
          ],
          marginBottom: bankaBilgileri ? 16 : 0,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(bankaBilgileri ? [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#e8eaf0" }] } as unknown as import("pdfmake/interfaces").Content,
          { text: "ÖDEME BİLGİLERİ", style: "bolumBaslik", marginBottom: 6 },
          { text: bankaBilgileri, fontSize: 9, color: "#333", lineHeight: 1.4 },
        ] : []),
        ...(f.aciklama ? [{ text: f.aciklama, marginTop: 16, color: "#555", italics: true }] : []),
      ],
      styles: {
        sirketAd: { fontSize: 16, bold: true, color: "#0070d1" },
        faturaBaslik: { fontSize: 22, color: "#0070d1" },
        bolumBaslik: { fontSize: 8, bold: true, color: "#888", characterSpacing: 1 },
        tabloBaslik: { bold: true, color: "#ffffff", fillColor: "#0070d1" },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfStream: NodeJS.ReadableStream & { end(): void } = await _pdfmake.createPdf(docDefinition).getStream();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="fatura-${f.faturaNo}.pdf"`);
    pdfStream.pipe(res);
    pdfStream.end();
  } catch (err) {
    console.error("[pdf] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Fatura PDF oluşturulamadı" });
  }
});

router.patch("/faturalar/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(faturalar).where(eq(faturalar.id, id));
    if (!existing) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const { vadeTarihi, notlar, aciklama, durum } = req.body;
    const [row] = await db.update(faturalar)
      .set({ vadeTarihi, notlar, aciklama, durum })
      .where(eq(faturalar.id, id))
      .returning();
    res.json(formatFatura(row, null, null, null, 0));
  } catch {
    res.status(500).json({ error: "Fatura güncellenemedi" });
  }
});

router.delete("/faturalar/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(faturalar).where(eq(faturalar.id, id));
    if (!existing) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    await db.delete(faturalar).where(eq(faturalar.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Fatura silinemedi" });
  }
});

router.post("/faturalar/:id/gonder", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { aliciAdres, aliciAd, konu } = req.body as { aliciAdres?: string; aliciAd?: string; konu?: string };
    if (!aliciAdres) { res.status(400).json({ error: "aliciAdres zorunludur" }); return; }

    const [row] = await db
      .select({ f: faturalar, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad })
      .from(faturalar)
      .leftJoin(firmalar, eq(faturalar.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .where(eq(faturalar.id, id));
    if (!row) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.f.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const [ayarlar] = await db.select().from(firmaEpostaAyarlari)
      .where(eq(firmaEpostaAyarlari.firmaId, row.f.catiFirmaId));
    if (!ayarlar || !ayarlar.aktif || !ayarlar.smtpSifre) {
      res.status(422).json({ error: "Bu firma için aktif SMTP ayarları yapılandırılmamış" }); return;
    }

    const pdfUrl = `http://localhost:${process.env.PORT ?? 3001}/api/faturalar/${id}/pdf`;
    const pdfResp = await fetch(pdfUrl, {
      headers: { authorization: req.headers.authorization ?? "" },
    });
    if (!pdfResp.ok) { res.status(500).json({ error: "PDF oluşturulamadı" }); return; }
    const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());

    const guvenlik = ayarlar.smtpGuvenlik ?? "starttls";
    const transporter = nodemailer.createTransport({
      host: ayarlar.smtpHost,
      port: ayarlar.smtpPort ?? 587,
      secure: guvenlik === "ssl",
      requireTLS: guvenlik === "starttls",
      auth: { user: ayarlar.smtpKullanici, pass: ayarlar.smtpSifre },
    });

    const faturaNo = row.f.faturaNo;
    await transporter.sendMail({
      from: `"${ayarlar.gonderenAd}" <${ayarlar.gonderenAdres}>`,
      to: aliciAd ? `"${aliciAd}" <${aliciAdres}>` : aliciAdres,
      subject: konu ?? `Fatura ${faturaNo}`,
      text: `Sayın ${aliciAd ?? aliciAdres},\n\nEkte ${faturaNo} numaralı faturanızı bulabilirsiniz.\n\nSaygılarımızla,\n${ayarlar.gonderenAd}`,
      attachments: [{ filename: `fatura-${faturaNo}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
    });

    res.json({ mesaj: `Fatura ${faturaNo} adresine gönderildi: ${aliciAdres}` });
  } catch (err) {
    console.error("[gonder] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "E-posta gönderilemedi" });
  }
});

async function hesaplaOdenenler(): Promise<Record<number, number>> {
  const rows = await db
    .select({ faturaId: odemeler.faturaId, toplam: sql<string>`sum(${odemeler.tutar})` })
    .from(odemeler).where(sql`${odemeler.faturaId} is not null AND ${odemeler.tip} = 'tahsilat'`).groupBy(odemeler.faturaId);
  const result: Record<number, number> = {};
  for (const r of rows) { if (r.faturaId != null) result[r.faturaId] = Number(r.toplam ?? 0); }
  return result;
}

async function bagliAdlariGetir(): Promise<Record<number, string>> {
  const rows = await db.select({ id: firmalar.id, ad: firmalar.ad }).from(firmalar);
  const result: Record<number, string> = {};
  for (const r of rows) result[r.id] = r.ad;
  return result;
}

function formatFatura(
  f: typeof faturalar.$inferSelect,
  catiFirmaAd: string | null | undefined,
  bagliFirmaAd: string | null | undefined,
  gemiAd: string | null | undefined,
  odenen: number
) {
  const genel = Number(f.genelToplam);
  return {
    id: f.id, catiFirmaId: f.catiFirmaId, catiFirmaAd: catiFirmaAd ?? null,
    bagliFirmaId: f.bagliFirmaId, bagliFirmaAd: bagliFirmaAd ?? null,
    gemiId: f.gemiId, gemiAd: gemiAd ?? null,
    faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
    paraBirimi: f.paraBirimi, durum: f.durum,
    toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
    genelToplam: genel, odenenTutar: odenen, kalanTutar: Math.max(0, genel - odenen),
    notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
  };
}

export default router;
