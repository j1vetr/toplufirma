import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, faturaKalemleri, sirketler, cariler, gemiler, odemeler, faturaSerileri } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";
import ExcelJS from "exceljs";

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
    if (yetkisiz) return res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
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
    if (!sirketId || !cariId || !faturaTarihi || !vadeTarihi || !kalemler?.length)
      return res.status(400).json({ error: "Zorunlu alanlar eksik" });
    if (!sirketErisimKontrol(Number(sirketId), req)) return res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });

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
      return res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
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
    if (yetkisiz) return res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
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
    if (!row) return res.status(404).json({ error: "Fatura bulunamadı" });
    if (!sirketErisimKontrol(row.f.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });

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
    if (!row) return res.status(404).json({ error: "Fatura bulunamadı" });
    if (!sirketErisimKontrol(row.f.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });

    const kalemler = await db.select().from(faturaKalemleri).where(eq(faturaKalemleri.faturaId, id));
    const ods = await db.select().from(odemeler).where(eq(odemeler.faturaId, id));
    const odenen = ods.reduce((s, o) => s + Number(o.tutar), 0);
    const f = row.f;

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><style>
      body{font-family:Arial,sans-serif;margin:0;padding:40px;color:#1a1a2e;font-size:13px}
      .header{display:flex;justify-content:space-between;margin-bottom:32px}
      .logo{font-size:22px;font-weight:700;color:#0070d1}
      .fatura-title{font-size:28px;font-weight:300;color:#0070d1;letter-spacing:2px}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
      .info-box{background:#f4f5f8;padding:16px;border-radius:8px}
      .info-box h3{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666}
      .info-box p{margin:3px 0;font-size:13px}
      table{width:100%;border-collapse:collapse;margin:24px 0}
      th{background:#0070d1;color:white;padding:10px 12px;text-align:left;font-size:12px;font-weight:500}
      td{padding:9px 12px;border-bottom:1px solid #e8eaf0;font-size:12px}
      tr:hover td{background:#f9fafc}
      .totals{margin-left:auto;width:280px;margin-top:16px}
      .totals tr td{border:none;padding:5px 12px}
      .totals .total-row td{font-weight:700;font-size:14px;border-top:2px solid #0070d1;padding-top:10px;color:#0070d1}
      .status{display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:500;margin-bottom:8px}
      .status-odendi{background:#dcfce7;color:#16a34a}
      .status-acik{background:#fee2e2;color:#dc2626}
      .status-kismi{background:#fef3c7;color:#d97706}
    </style></head><body>
    <div class="header">
      <div><div class="logo">${row.sirketAd ?? "Şirket"}</div><div style="font-size:11px;color:#888;margin-top:4px">Muhasebe Paneli</div></div>
      <div style="text-align:right"><div class="fatura-title">FATURA</div><div style="font-size:16px;font-weight:600">${f.faturaNo}</div>
      <div class="status status-${f.durum === "odendi" ? "odendi" : f.durum === "acik" ? "acik" : "kismi"}">${f.durum === "odendi" ? "Ödendi" : f.durum === "acik" ? "Ödenmedi" : "Kısmen Ödendi"}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-box"><h3>Müşteri Bilgileri</h3><p><strong>${row.cariAd ?? "-"}</strong></p>${row.gemiAd ? `<p>Gemi: ${row.gemiAd}</p>` : ""}</div>
      <div class="info-box"><h3>Fatura Detayları</h3>
        <p>Fatura Tarihi: <strong>${f.faturaTarihi}</strong></p>
        <p>Vade Tarihi: <strong>${f.vadeTarihi}</strong></p>
        <p>Para Birimi: <strong>${f.paraBirimi}</strong></p>
      </div>
    </div>
    <table><thead><tr><th>Açıklama</th><th style="text-align:right">Miktar</th><th style="text-align:right">Birim Fiyat</th><th style="text-align:right">KDV %</th><th style="text-align:right">Toplam</th></tr></thead>
    <tbody>${kalemler.map(k => `<tr><td>${k.aciklama}</td><td style="text-align:right">${Number(k.miktar).toFixed(2)}</td><td style="text-align:right">${Number(k.birimFiyat).toFixed(2)}</td><td style="text-align:right">${Number(k.kdvOrani).toFixed(0)}%</td><td style="text-align:right">${Number(k.genelToplam).toFixed(2)}</td></tr>`).join("")}</tbody>
    </table>
    <table class="totals"><tr><td>Ara Toplam:</td><td style="text-align:right">${Number(f.toplamTutar).toFixed(2)} ${f.paraBirimi}</td></tr>
    <tr><td>KDV:</td><td style="text-align:right">${Number(f.kdvTutari).toFixed(2)} ${f.paraBirimi}</td></tr>
    <tr><td>Ödenen:</td><td style="text-align:right">${odenen.toFixed(2)} ${f.paraBirimi}</td></tr>
    <tr class="total-row"><td>Kalan:</td><td style="text-align:right">${Math.max(0, Number(f.genelToplam) - odenen).toFixed(2)} ${f.paraBirimi}</td></tr>
    </table>
    ${f.aciklama ? `<p style="margin-top:24px;padding:12px;background:#f4f5f8;border-radius:8px;font-size:12px;color:#555">${f.aciklama}</p>` : ""}
    </body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="fatura-${f.faturaNo}.html"`);
    res.send(html);
  } catch {
    res.status(500).json({ error: "Fatura PDF oluşturulamadı" });
  }
});

router.patch("/faturalar/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(faturalar).where(eq(faturalar.id, id));
    if (!existing) return res.status(404).json({ error: "Fatura bulunamadı" });
    if (!sirketErisimKontrol(existing.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });

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
    if (!existing) return res.status(404).json({ error: "Fatura bulunamadı" });
    if (!sirketErisimKontrol(existing.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });
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
