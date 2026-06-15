import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, faturaKalemleri, sirketler, cariler, gemiler, odemeler, faturaSerileri } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";
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
    const { sirketId, cariId, durum, paraBirimi, baslangicTarihi, bitisTarihi } = req.query as Record<string, string>;

    let rows = await db
      .select({ f: faturalar, sirketAd: sirketler.ad, cariAd: cariler.ad, gemiAd: gemiler.ad })
      .from(faturalar)
      .leftJoin(sirketler, eq(faturalar.sirketId, sirketler.id))
      .leftJoin(cariler, eq(faturalar.cariId, cariler.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .orderBy(faturalar.faturaTarihi);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, sirketId: r.f.sirketId })),
      req, sirketId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }
    rows = rows.filter(r => scoped.some(s => s.f.id === r.f.id));

    if (cariId) rows = rows.filter(r => r.f.cariId === Number(cariId));
    if (durum) rows = rows.filter(r => r.f.durum === durum);
    if (paraBirimi) rows = rows.filter(r => r.f.paraBirimi === paraBirimi);
    if (baslangicTarihi) rows = rows.filter(r => r.f.faturaTarihi >= baslangicTarihi);
    if (bitisTarihi) rows = rows.filter(r => r.f.faturaTarihi <= bitisTarihi);

    const odenenler = await hesaplaOdenenler();
    res.json(rows.map(r => formatFatura(r.f, r.sirketAd, r.cariAd, r.gemiAd, odenenler[r.f.id] ?? 0)));
  } catch {
    res.status(500).json({ error: "Faturalar listelenemedi" });
  }
});

router.post("/faturalar", requireYazma, async (req, res) => {
  try {
    const { sirketId, cariId, gemiId, faturaSerisiId, faturaTarihi, vadeTarihi, paraBirimi, notlar, aciklama, kalemler } = req.body;
    if (!sirketId || !cariId || !faturaTarihi || !vadeTarihi || !kalemler?.length) {
      res.status(400).json({ error: "Zorunlu alanlar eksik" }); return;
    }
    if (!sirketErisimKontrol(Number(sirketId), req)) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }

    let faturaNo = "";
    if (faturaSerisiId) {
      const [seri] = await db.select().from(faturaSerileri).where(eq(faturaSerileri.id, faturaSerisiId));
      if (seri) {
        faturaNo = `${seri.onek}${String(seri.sonrakiNo).padStart(6, "0")}`;
        await db.update(faturaSerileri).set({ sonrakiNo: seri.sonrakiNo + 1 }).where(eq(faturaSerileri.id, seri.id));
      }
    }
    if (!faturaNo) {
      const [sirket] = await db.select().from(sirketler).where(eq(sirketler.id, sirketId));
      const prefix = sirket?.seriOneki ?? "FAT";
      const [count] = await db.select({ n: sql<number>`count(*)` }).from(faturalar).where(eq(faturalar.sirketId, sirketId));
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
      sirketId, cariId, gemiId: gemiId ?? null, faturaSerisiId: faturaSerisiId ?? null,
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
    const { sirketId } = req.query as Record<string, string>;
    if (sirketId && !sirketErisimKontrol(Number(sirketId), req)) {
      res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
      return;
    }

    let rows = await db
      .select({ f: faturalar, sirketAd: sirketler.ad, cariAd: cariler.ad, gemiAd: gemiler.ad })
      .from(faturalar)
      .leftJoin(sirketler, eq(faturalar.sirketId, sirketler.id))
      .leftJoin(cariler, eq(faturalar.cariId, cariler.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .orderBy(faturalar.faturaTarihi);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, sirketId: r.f.sirketId })), req, sirketId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }
    rows = rows.filter(r => scoped.some(s => s.f.id === r.f.id));

    const wb = new ExcelJS.Workbook();
    wb.creator = "Muhasebe Paneli";
    const ws = wb.addWorksheet("Faturalar");
    ws.columns = [
      { header: "Fatura No", key: "faturaNo", width: 16 },
      { header: "Şirket", key: "sirketAd", width: 28 },
      { header: "Cari", key: "cariAd", width: 28 },
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
        faturaNo: r.f.faturaNo, sirketAd: r.sirketAd, cariAd: r.cariAd, gemiAd: r.gemiAd,
        faturaTarihi: r.f.faturaTarihi, vadeTarihi: r.f.vadeTarihi, paraBirimi: r.f.paraBirimi,
        toplamTutar: Number(r.f.toplamTutar), kdvTutari: Number(r.f.kdvTutari),
        genelToplam: Number(r.f.genelToplam), durum: r.f.durum, aciklama: r.f.aciklama,
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
      .select({ f: faturalar, sirketAd: sirketler.ad, cariAd: cariler.ad, gemiAd: gemiler.ad })
      .from(faturalar)
      .leftJoin(sirketler, eq(faturalar.sirketId, sirketler.id))
      .leftJoin(cariler, eq(faturalar.cariId, cariler.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .where(eq(faturalar.id, id));
    if (!row) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.f.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const kalemler = await db.select().from(faturaKalemleri).where(eq(faturaKalemleri.faturaId, id));
    const ods = await db.select().from(odemeler).where(eq(odemeler.faturaId, id));
    const odenen = ods.reduce((s, o) => s + Number(o.tutar), 0);

    res.json({
      ...formatFatura(row.f, row.sirketAd, row.cariAd, row.gemiAd, odenen),
      kalemler: kalemler.map(k => ({
        id: k.id, faturaId: k.faturaId, aciklama: k.aciklama,
        miktar: Number(k.miktar), birimFiyat: Number(k.birimFiyat),
        kdvOrani: Number(k.kdvOrani), araToplam: Number(k.araToplam),
        kdvTutari: Number(k.kdvTutari), genelToplam: Number(k.genelToplam),
      })),
      odemeler: ods.map(o => ({
        id: o.id, sirketId: o.sirketId, cariId: o.cariId, faturaId: o.faturaId,
        tip: o.tip, tarih: o.tarih, tutar: Number(o.tutar), paraBirimi: o.paraBirimi,
        odemeYontemi: o.odemeYontemi, aciklama: o.aciklama, olusturmaTarihi: o.olusturmaTarihi,
        sirketAd: null, cariAd: null, gemiId: o.gemiId, gemiAd: null,
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
      .select({ f: faturalar, sirketAd: sirketler.ad, cariAd: cariler.ad, gemiAd: gemiler.ad })
      .from(faturalar)
      .leftJoin(sirketler, eq(faturalar.sirketId, sirketler.id))
      .leftJoin(cariler, eq(faturalar.cariId, cariler.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .where(eq(faturalar.id, id));
    if (!row) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.f.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const kalemler = await db.select().from(faturaKalemleri).where(eq(faturaKalemleri.faturaId, id));
    const ods = await db.select().from(odemeler).where(eq(odemeler.faturaId, id));
    const odenen = ods.reduce((s, o) => s + Number(o.tutar), 0);
    const f = row.f;

    const durumEtiket = f.durum === "odendi" ? "ODENDI" : f.durum === "acik" ? "ODENMEDI" : "KISMI ODENDI";
    const kalan = Math.max(0, Number(f.genelToplam) - odenen);

    const docDefinition: TDocumentDefinitions = {
      defaultStyle: { font: "Roboto", fontSize: 10 },
      pageMargins: [40, 60, 40, 60],
      content: [
        {
          columns: [
            { text: row.sirketAd ?? "Sirket", style: "sirketAd", width: "*" },
            { text: ["FATURA\n", { text: f.faturaNo, fontSize: 14, bold: true }], style: "faturaBaslik", alignment: "right", width: "auto" },
          ],
          marginBottom: 20,
        },
        {
          canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: "#0070d1" }],
          marginBottom: 16,
        },
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "MUSTERI BILGILERI", style: "bolumBaslik" },
                { text: row.cariAd ?? "-", bold: true, marginTop: 4 },
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
                { text: "Aciklama", style: "tabloBaslik" },
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
                  [{ text: "KDV Tutari:", color: "#555" }, { text: `${Number(f.kdvTutari).toFixed(2)} ${f.paraBirimi}`, alignment: "right" }],
                  [{ text: "Genel Toplam:", bold: true }, { text: `${Number(f.genelToplam).toFixed(2)} ${f.paraBirimi}`, alignment: "right", bold: true }],
                  [{ text: "Odenen:", color: "#555" }, { text: `${odenen.toFixed(2)} ${f.paraBirimi}`, alignment: "right" }],
                  [
                    { text: "KALAN BORC:", bold: true, fontSize: 12, color: "#0070d1" },
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
        },
        ...(f.aciklama ? [{ text: f.aciklama, marginTop: 24, color: "#555", italics: true }] : []),
      ],
      styles: {
        sirketAd: { fontSize: 18, bold: true, color: "#0070d1" },
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
    if (!sirketErisimKontrol(existing.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

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
    if (!sirketErisimKontrol(existing.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    await db.delete(faturalar).where(eq(faturalar.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Fatura silinemedi" });
  }
});

async function hesaplaOdenenler(): Promise<Record<number, number>> {
  const rows = await db
    .select({ faturaId: odemeler.faturaId, toplam: sql<string>`sum(${odemeler.tutar})` })
    .from(odemeler).where(sql`${odemeler.faturaId} is not null`).groupBy(odemeler.faturaId);
  const result: Record<number, number> = {};
  for (const r of rows) { if (r.faturaId != null) result[r.faturaId] = Number(r.toplam ?? 0); }
  return result;
}

function formatFatura(
  f: typeof faturalar.$inferSelect,
  sirketAd: string | null | undefined, cariAd: string | null | undefined,
  gemiAd: string | null | undefined, odenen: number
) {
  const genel = Number(f.genelToplam);
  return {
    id: f.id, sirketId: f.sirketId, sirketAd: sirketAd ?? null,
    cariId: f.cariId, cariAd: cariAd ?? null, gemiId: f.gemiId, gemiAd: gemiAd ?? null,
    faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
    paraBirimi: f.paraBirimi, durum: f.durum,
    toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
    genelToplam: genel, odenenTutar: odenen, kalanTutar: Math.max(0, genel - odenen),
    notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
  };
}

export default router;
