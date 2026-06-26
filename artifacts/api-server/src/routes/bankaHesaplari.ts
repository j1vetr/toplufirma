import { Router } from "express";
import { db } from "@workspace/db";
import { bankaHesaplari, firmalar, odemeler } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele, firmaYazmaDenetimi } from "../middleware/auth";
import { createRequire } from "node:module";
import path from "node:path";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import ExcelJS from "exceljs";

const _reqPdfB = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _pdfmakeB = _reqPdfB("pdfmake") as any;
const _pdfmakeBDir = path.dirname(_reqPdfB.resolve("pdfmake/package.json"));
_pdfmakeB.fonts = {
  Roboto: {
    normal:      path.join(_pdfmakeBDir, "fonts/Roboto/Roboto-Regular.ttf"),
    bold:        path.join(_pdfmakeBDir, "fonts/Roboto/Roboto-Medium.ttf"),
    italics:     path.join(_pdfmakeBDir, "fonts/Roboto/Roboto-Italic.ttf"),
    bolditalics: path.join(_pdfmakeBDir, "fonts/Roboto/Roboto-MediumItalic.ttf"),
  },
};
_pdfmakeB.setLocalAccessPolicy(() => true);

const router = Router();

router.get("/banka-hesaplari", async (req, res) => {
  try {
    const { catiFirmaId } = req.query as Record<string, string>;
    const rows = await db
      .select({ h: bankaHesaplari, catiFirmaAd: firmalar.ad })
      .from(bankaHesaplari)
      .leftJoin(firmalar, eq(bankaHesaplari.catiFirmaId, firmalar.id))
      .orderBy(bankaHesaplari.bankaAdi);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, catiFirmaId: r.h.catiFirmaId })), req, catiFirmaId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    const filtered = rows.filter(r => scoped.some(s => s.h.id === r.h.id));

    const bakiyeler = await hesaplaHesapBakiyeleri();
    res.json(filtered.map(r => formatHesap(r.h, r.catiFirmaAd, bakiyeler[r.h.id] ?? 0)));
  } catch {
    res.status(500).json({ error: "Banka hesapları listelenemedi" });
  }
});

router.post("/banka-hesaplari", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, bankaAdi, hesapAdi, iban, swift, paraBirimi, subeAdi, aciklama, aktif, faturadaGoster } = req.body;
    if (!catiFirmaId || !hesapAdi) { res.status(400).json({ error: "catiFirmaId ve hesapAdi zorunludur" }); return; }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    const [row] = await db.insert(bankaHesaplari).values({
      catiFirmaId, bankaAdi, hesapAdi, iban, swift, paraBirimi: paraBirimi ?? "USD",
      subeAdi, aciklama, aktif: aktif ?? true, faturadaGoster: faturadaGoster ?? true,
    }).returning();
    res.status(201).json(formatHesap(row, null, 0));
  } catch {
    res.status(500).json({ error: "Banka hesabı oluşturulamadı" });
  }
});

router.get("/banka-hesaplari/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ h: bankaHesaplari, catiFirmaAd: firmalar.ad })
      .from(bankaHesaplari).leftJoin(firmalar, eq(bankaHesaplari.catiFirmaId, firmalar.id))
      .where(eq(bankaHesaplari.id, id));
    if (!row) { res.status(404).json({ error: "Banka hesabı bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.h.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    const bakiyeler = await hesaplaHesapBakiyeleri();
    res.json(formatHesap(row.h, row.catiFirmaAd, bakiyeler[id] ?? 0));
  } catch {
    res.status(500).json({ error: "Banka hesabı getirilemedi" });
  }
});

router.patch("/banka-hesaplari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(bankaHesaplari).where(eq(bankaHesaplari.id, id));
    if (!existing) { res.status(404).json({ error: "Banka hesabı bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const { bankaAdi, hesapAdi, iban, swift, paraBirimi, subeAdi, aciklama, aktif, faturadaGoster } = req.body;
    const [row] = await db.update(bankaHesaplari)
      .set({ bankaAdi, hesapAdi, iban, swift, paraBirimi, subeAdi, aciklama, aktif, faturadaGoster })
      .where(eq(bankaHesaplari.id, id)).returning();
    const bakiyeler = await hesaplaHesapBakiyeleri();
    res.json(formatHesap(row, null, bakiyeler[id] ?? 0));
  } catch {
    res.status(500).json({ error: "Banka hesabı güncellenemedi" });
  }
});

router.delete("/banka-hesaplari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(bankaHesaplari).where(eq(bankaHesaplari.id, id));
    if (!existing) { res.status(404).json({ error: "Banka hesabı bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
    await db.delete(bankaHesaplari).where(eq(bankaHesaplari.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Banka hesabı silinemedi" });
  }
});

router.get("/banka-hesaplari/:id/hareketler", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [hesap] = await db.select().from(bankaHesaplari).where(eq(bankaHesaplari.id, id));
    if (!hesap) { res.status(404).json({ error: "Banka hesabı bulunamadı" }); return; }
    if (!sirketErisimKontrol(hesap.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const ods = await db.select().from(odemeler).where(eq(odemeler.bankaHesabiId, id)).orderBy(odemeler.tarih);
    let toplamGelen = 0, toplamGiden = 0;
    const hareketler = ods.map(o => {
      const tutar = Number(o.tutar);
      if (o.tip === "tahsilat") toplamGelen += tutar; else toplamGiden += tutar;
      return { id: o.id, tarih: o.tarih, tip: o.tip, tutar, paraBirimi: o.paraBirimi, aciklama: o.aciklama, firmaAd: null, faturaNo: null };
    });
    res.json({ hesapId: id, hareketler, toplamGelen, toplamGiden, netBakiye: toplamGelen - toplamGiden });
  } catch {
    res.status(500).json({ error: "Hareketler getirilemedi" });
  }
});

router.get("/banka-hesaplari/:id/hareketler/excel", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [hesap] = await db.select().from(bankaHesaplari).where(eq(bankaHesaplari.id, id));
    if (!hesap) { res.status(404).json({ error: "Banka hesabı bulunamadı" }); return; }
    if (!sirketErisimKontrol(hesap.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const ods = await db.select().from(odemeler).where(eq(odemeler.bankaHesabiId, id)).orderBy(odemeler.tarih);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Muhasebe Paneli";
    const ws = wb.addWorksheet("Banka Hareketleri");
    ws.columns = [
      { header: "Tarih", key: "tarih", width: 14 },
      { header: "Tip", key: "tip", width: 14 },
      { header: "Tutar", key: "tutar", width: 16 },
      { header: "Para Birimi", key: "paraBirimi", width: 12 },
      { header: "Açıklama", key: "aciklama", width: 40 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const o of ods) {
      ws.addRow({ tarih: o.tarih, tip: o.tip === "tahsilat" ? "Gelen" : "Giden", tutar: Number(o.tutar), paraBirimi: o.paraBirimi, aciklama: o.aciklama ?? "" });
    }

    res.setHeader("Content-Disposition", `attachment; filename="banka-${id}-hareketler.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await wb.xlsx.write(res);
    res.end();
  } catch {
    res.status(500).json({ error: "Hareketler Excel oluşturulamadı" });
  }
});

router.get("/banka-hesaplari/:id/hareketler/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [hesap] = await db
      .select({ h: bankaHesaplari, catiFirmaAd: firmalar.ad })
      .from(bankaHesaplari).leftJoin(firmalar, eq(bankaHesaplari.catiFirmaId, firmalar.id))
      .where(eq(bankaHesaplari.id, id)).then(r => r);
    if (!hesap) { res.status(404).json({ error: "Banka hesabı bulunamadı" }); return; }
    if (!sirketErisimKontrol(hesap.h.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const ods = await db.select().from(odemeler).where(eq(odemeler.bankaHesabiId, id)).orderBy(odemeler.tarih);
    let toplamGelen = 0, toplamGiden = 0;
    for (const o of ods) { if (o.tip === "tahsilat") toplamGelen += Number(o.tutar); else toplamGiden += Number(o.tutar); }

    const docDef: TDocumentDefinitions = {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      content: [
        { text: `${hesap.h.bankaAdi} - ${hesap.h.hesapAdi}`, style: "header" } as unknown as import("pdfmake/interfaces").Content,
        { text: hesap.catiFirmaAd ?? "", style: "subheader" } as unknown as import("pdfmake/interfaces").Content,
        {
          table: {
            headerRows: 1,
            widths: [60, 60, 60, 40, "*"],
            body: [
              ["Tarih", "Tip", "Tutar", "PB", "Açıklama"].map(t => ({ text: t, bold: true, fillColor: "#f0f0f0" })),
              ...ods.map(o => [o.tarih, o.tip === "tahsilat" ? "Gelen" : "Giden", Number(o.tutar).toFixed(2), o.paraBirimi, o.aciklama ?? "-"]),
            ],
          },
          layout: "lightHorizontalLines",
        },
        { text: `Toplam Gelen: ${toplamGelen.toFixed(2)}   Toplam Giden: ${toplamGiden.toFixed(2)}   Net Bakiye: ${(toplamGelen - toplamGiden).toFixed(2)}`, margin: [0, 12, 0, 0] as [number, number, number, number] },
      ],
      styles: {
        header: { fontSize: 15, bold: true, margin: [0, 0, 0, 6] as [number, number, number, number] },
        subheader: { fontSize: 10, color: "#666666", margin: [0, 0, 0, 14] as [number, number, number, number] },
      },
      defaultStyle: { fontSize: 9, font: "Roboto" },
    };

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="banka-${id}-hareketler.pdf"`);
    _pdfmakeB.createPdf(docDef).getStream().pipe(res);
  } catch {
    res.status(500).json({ error: "Hareketler PDF oluşturulamadı" });
  }
});

async function hesaplaHesapBakiyeleri(): Promise<Record<number, number>> {
  const rows = await db
    .select({ bankaHesabiId: odemeler.bankaHesabiId, tip: odemeler.tip, toplam: sql<string>`sum(${odemeler.tutar})` })
    .from(odemeler).where(sql`${odemeler.bankaHesabiId} is not null`)
    .groupBy(odemeler.bankaHesabiId, odemeler.tip);
  const result: Record<number, number> = {};
  for (const r of rows) {
    if (r.bankaHesabiId == null) continue;
    if (!result[r.bankaHesabiId]) result[r.bankaHesabiId] = 0;
    result[r.bankaHesabiId] += r.tip === "tahsilat" ? Number(r.toplam ?? 0) : -Number(r.toplam ?? 0);
  }
  return result;
}

function formatHesap(h: typeof bankaHesaplari.$inferSelect, catiFirmaAd: string | null | undefined, bakiye: number) {
  return {
    id: h.id, catiFirmaId: h.catiFirmaId, catiFirmaAd: catiFirmaAd ?? null,
    bankaAdi: h.bankaAdi, hesapAdi: h.hesapAdi, iban: h.iban, swift: h.swift,
    paraBirimi: h.paraBirimi, subeAdi: h.subeAdi, aciklama: h.aciklama,
    aktif: h.aktif, faturadaGoster: h.faturadaGoster, bakiye, olusturmaTarihi: h.olusturmaTarihi,
  };
}

export default router;
