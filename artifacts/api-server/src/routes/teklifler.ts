import { Router } from "express";
import { db } from "@workspace/db";
import { teklifler, teklifKalemleri, firmalar, gemiler, bankaHesaplari, faturalar, faturaKalemleri, faturaSerileri } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele, firmaYazmaDenetimi } from "../middleware/auth";
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

// ── LIST ─────────────────────────────────────────────────────────────────
router.get("/teklifler", async (req, res) => {
  try {
    const { catiFirmaId, gemiId, durum, paraBirimi } = req.query as Record<string, string>;

    let rows = await db
      .select({ t: teklifler, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad })
      .from(teklifler)
      .leftJoin(firmalar, eq(teklifler.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(teklifler.gemiId, gemiler.id))
      .orderBy(teklifler.tarih);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, catiFirmaId: r.t.catiFirmaId })),
      req, catiFirmaId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    rows = rows.filter(r => scoped.some(s => s.t.id === r.t.id));

    if (gemiId) rows = rows.filter(r => r.t.gemiId === Number(gemiId));
    if (durum) rows = rows.filter(r => r.t.durum === durum);
    if (paraBirimi) rows = rows.filter(r => r.t.paraBirimi === paraBirimi);

    res.json(rows.map(r => formatTeklif(r.t, r.catiFirmaAd, r.gemiAd)));
  } catch {
    res.status(500).json({ error: "Teklifler listelenemedi" });
  }
});

// ── CREATE ────────────────────────────────────────────────────────────────
router.post("/teklifler", requireYazma, async (req, res) => {
  try {
    const {
      catiFirmaId, gemiId, tarih, gecerlilikTarihi,
      aliciAd, aliciAdres, aliciTelefon, paraBirimi,
      kurNotu, notlar, kosullar, kalemler,
    } = req.body;

    if (!catiFirmaId || !tarih || !aliciAd || !kalemler?.length) {
      res.status(400).json({ error: "Zorunlu alanlar eksik" }); return;
    }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) {
      res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return;
    }
    if (!firmaYazmaDenetimi(Number(catiFirmaId), req)) {
      res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return;
    }

    if (gemiId) {
      const [gemiRow] = await db.select({ firmaId: gemiler.firmaId }).from(gemiler).where(eq(gemiler.id, Number(gemiId)));
      if (!gemiRow) { res.status(400).json({ error: "Belirtilen gemi bulunamadı" }); return; }
      const [gFirma] = await db.select({ ustFirmaId: firmalar.ustFirmaId }).from(firmalar).where(eq(firmalar.id, gemiRow.firmaId));
      if (!gFirma || gFirma.ustFirmaId !== Number(catiFirmaId)) {
        res.status(400).json({ error: "Belirtilen gemi bu çatı firmaya ait değil" }); return;
      }
    }

    const [catiFirma] = await db.select({ seriOneki: firmalar.seriOneki }).from(firmalar).where(eq(firmalar.id, Number(catiFirmaId)));
    const prefix = catiFirma?.seriOneki ? `${catiFirma.seriOneki}TKL` : "TKL";
    const [count] = await db.select({ n: sql<number>`count(*)` }).from(teklifler).where(eq(teklifler.catiFirmaId, Number(catiFirmaId)));
    const teklifNo = `${prefix}${String(Number(count?.n ?? 0) + 1).padStart(5, "0")}`;

    const [teklif] = await db.insert(teklifler).values({
      catiFirmaId: Number(catiFirmaId),
      gemiId: gemiId ? Number(gemiId) : null,
      teklifNo,
      tarih,
      gecerlilikTarihi: gecerlilikTarihi ?? null,
      aliciAd,
      aliciAdres: aliciAdres ?? null,
      aliciTelefon: aliciTelefon ?? null,
      paraBirimi: paraBirimi ?? "USD",
      kurNotu: kurNotu ?? null,
      notlar: notlar ?? null,
      kosullar: kosullar ?? null,
      durum: "taslak",
    }).returning();

    for (let i = 0; i < kalemler.length; i++) {
      const k = kalemler[i] as { aciklama: string; miktar: number; birimFiyat: number; birim?: string; opsiyonel?: boolean };
      await db.insert(teklifKalemleri).values({
        teklifId: teklif.id,
        sira: i,
        aciklama: k.aciklama,
        miktar: String(k.miktar),
        birimFiyat: String(k.birimFiyat),
        birim: k.birim ?? "Adet",
        opsiyonel: k.opsiyonel ?? false,
      });
    }

    res.status(201).json(formatTeklif(teklif, null, null));
  } catch {
    res.status(500).json({ error: "Teklif oluşturulamadı" });
  }
});

// ── GET ONE ───────────────────────────────────────────────────────────────
router.get("/teklifler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ t: teklifler, catiFirmaAd: firmalar.ad, catiFirmaLogo: firmalar.logo, gemiAd: gemiler.ad, gemiImo: gemiler.imoNumarasi })
      .from(teklifler)
      .leftJoin(firmalar, eq(teklifler.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(teklifler.gemiId, gemiler.id))
      .where(eq(teklifler.id, id));
    if (!row) { res.status(404).json({ error: "Teklif bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.t.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const kalemler = await db.select().from(teklifKalemleri).where(eq(teklifKalemleri.teklifId, id)).orderBy(teklifKalemleri.sira);
    const bankalar = await db.select().from(bankaHesaplari).where(and(eq(bankaHesaplari.catiFirmaId, row.t.catiFirmaId), eq(bankaHesaplari.faturadaGoster, true)));

    res.json({
      ...formatTeklif(row.t, row.catiFirmaAd, row.gemiAd),
      catiFirmaLogo: row.catiFirmaLogo ?? null,
      gemiImo: row.gemiImo ?? null,
      kalemler: kalemler.map(k => ({
        id: k.id, teklifId: k.teklifId, sira: k.sira, aciklama: k.aciklama,
        miktar: Number(k.miktar), birimFiyat: Number(k.birimFiyat),
        birim: k.birim, opsiyonel: k.opsiyonel,
        toplam: Number(k.miktar) * Number(k.birimFiyat),
      })),
      bankaHesaplari: bankalar.map(b => ({
        id: b.id, bankaAdi: b.bankaAdi, hesapAdi: b.hesapAdi,
        iban: b.iban, paraBirimi: b.paraBirimi,
      })),
    });
  } catch {
    res.status(500).json({ error: "Teklif getirilemedi" });
  }
});

// ── UPDATE ────────────────────────────────────────────────────────────────
router.patch("/teklifler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(teklifler).where(eq(teklifler.id, id));
    if (!existing) { res.status(404).json({ error: "Teklif bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const {
      gemiId, tarih, gecerlilikTarihi, aliciAd, aliciAdres, aliciTelefon,
      paraBirimi, kurNotu, notlar, kosullar, kalemler,
    } = req.body;

    if (gemiId) {
      const [gemiRow] = await db.select({ firmaId: gemiler.firmaId }).from(gemiler).where(eq(gemiler.id, Number(gemiId)));
      if (!gemiRow) { res.status(400).json({ error: "Belirtilen gemi bulunamadı" }); return; }
      const [gFirma] = await db.select({ ustFirmaId: firmalar.ustFirmaId }).from(firmalar).where(eq(firmalar.id, gemiRow.firmaId));
      if (!gFirma || gFirma.ustFirmaId !== existing.catiFirmaId) {
        res.status(400).json({ error: "Belirtilen gemi bu çatı firmaya ait değil" }); return;
      }
    }

    await db.update(teklifler).set({
      gemiId: gemiId !== undefined ? (gemiId ? Number(gemiId) : null) : existing.gemiId,
      tarih: tarih ?? existing.tarih,
      gecerlilikTarihi: gecerlilikTarihi !== undefined ? (gecerlilikTarihi || null) : existing.gecerlilikTarihi,
      aliciAd: aliciAd ?? existing.aliciAd,
      aliciAdres: aliciAdres !== undefined ? (aliciAdres || null) : existing.aliciAdres,
      aliciTelefon: aliciTelefon !== undefined ? (aliciTelefon || null) : existing.aliciTelefon,
      paraBirimi: paraBirimi ?? existing.paraBirimi,
      kurNotu: kurNotu !== undefined ? (kurNotu || null) : existing.kurNotu,
      notlar: notlar !== undefined ? (notlar || null) : existing.notlar,
      kosullar: kosullar !== undefined ? (kosullar || null) : existing.kosullar,
      guncellenmeTarihi: new Date(),
    }).where(eq(teklifler.id, id));

    if (kalemler && Array.isArray(kalemler)) {
      await db.delete(teklifKalemleri).where(eq(teklifKalemleri.teklifId, id));
      for (let i = 0; i < kalemler.length; i++) {
        const k = kalemler[i] as { aciklama: string; miktar: number; birimFiyat: number; birim?: string; opsiyonel?: boolean };
        await db.insert(teklifKalemleri).values({
          teklifId: id, sira: i, aciklama: k.aciklama,
          miktar: String(k.miktar), birimFiyat: String(k.birimFiyat),
          birim: k.birim ?? "Adet", opsiyonel: k.opsiyonel ?? false,
        });
      }
    }

    const [updated] = await db.select().from(teklifler).where(eq(teklifler.id, id));
    res.json(formatTeklif(updated, null, null));
  } catch {
    res.status(500).json({ error: "Teklif güncellenemedi" });
  }
});

// ── STATUS CHANGE ─────────────────────────────────────────────────────────
router.patch("/teklifler/:id/durum", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { durum } = req.body as { durum?: string };
    const izinli = ["taslak", "gonderildi", "onaylandi", "reddedildi"];
    if (!durum || !izinli.includes(durum)) { res.status(400).json({ error: "Geçersiz durum" }); return; }

    const [existing] = await db.select().from(teklifler).where(eq(teklifler.id, id));
    if (!existing) { res.status(404).json({ error: "Teklif bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    await db.update(teklifler).set({
      durum: durum as typeof teklifler.$inferSelect["durum"],
      guncellenmeTarihi: new Date(),
    }).where(eq(teklifler.id, id));

    res.json({ ok: true, durum });
  } catch {
    res.status(500).json({ error: "Durum güncellenemedi" });
  }
});

// ── DELETE ────────────────────────────────────────────────────────────────
router.delete("/teklifler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(teklifler).where(eq(teklifler.id, id));
    if (!existing) { res.status(404).json({ error: "Teklif bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    await db.delete(teklifler).where(eq(teklifler.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Teklif silinemedi" });
  }
});

// ── FATURAYA DÖNÜŞTÜR ────────────────────────────────────────────────────
router.post("/teklifler/:id/faturaya-donustur", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { bagliFirmaId } = req.body as { bagliFirmaId?: number };

    if (!bagliFirmaId) {
      res.status(400).json({ error: "bagliFirmaId zorunludur" }); return;
    }

    const [teklif] = await db.select().from(teklifler).where(eq(teklifler.id, id));
    if (!teklif) { res.status(404).json({ error: "Teklif bulunamadı" }); return; }
    if (!sirketErisimKontrol(teklif.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(teklif.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
    if (teklif.durum !== "onaylandi") { res.status(400).json({ error: "Yalnızca onaylanan teklifler faturaya dönüştürülebilir" }); return; }

    const [bagliFirma] = await db.select({ uid: firmalar.ustFirmaId }).from(firmalar).where(eq(firmalar.id, Number(bagliFirmaId)));
    if (!bagliFirma || bagliFirma.uid !== teklif.catiFirmaId) {
      res.status(400).json({ error: "Belirtilen bağlı firma bu çatı firmaya ait değil" }); return;
    }

    const kalemler = await db.select().from(teklifKalemleri)
      .where(and(eq(teklifKalemleri.teklifId, id), eq(teklifKalemleri.opsiyonel, false)))
      .orderBy(teklifKalemleri.sira);

    if (!kalemler.length) { res.status(400).json({ error: "Faturaya dönüştürmek için en az bir zorunlu kalem gereklidir" }); return; }

    let faturaNo = "";
    const [varsayilanSeri] = await db.select().from(faturaSerileri)
      .where(and(eq(faturaSerileri.catiFirmaId, teklif.catiFirmaId), eq(faturaSerileri.varsayilan, true)));
    if (varsayilanSeri) {
      faturaNo = `${varsayilanSeri.onek}${String(varsayilanSeri.sonrakiNo).padStart(6, "0")}`;
      await db.update(faturaSerileri).set({ sonrakiNo: varsayilanSeri.sonrakiNo + 1 }).where(eq(faturaSerileri.id, varsayilanSeri.id));
    } else {
      const [catiFirma] = await db.select({ seriOneki: firmalar.seriOneki }).from(firmalar).where(eq(firmalar.id, teklif.catiFirmaId));
      const prefix = catiFirma?.seriOneki ?? "FAT";
      const [count] = await db.select({ n: sql<number>`count(*)` }).from(faturalar).where(eq(faturalar.catiFirmaId, teklif.catiFirmaId));
      faturaNo = `${prefix}${String(Number(count?.n ?? 0) + 1).padStart(6, "0")}`;
    }

    const today = new Date().toISOString().split("T")[0];
    const vade = new Date();
    vade.setDate(vade.getDate() + 30);
    const vadeTarihi = vade.toISOString().split("T")[0];

    let toplamTutar = 0;
    const faturaKalemRows = kalemler.map(k => {
      const ara = Number(k.miktar) * Number(k.birimFiyat);
      toplamTutar += ara;
      return { aciklama: k.aciklama, miktar: String(k.miktar), birimFiyat: String(k.birimFiyat), kdvOrani: "0", araToplam: String(ara), kdvTutari: "0", genelToplam: String(ara) };
    });

    const [fatura] = await db.insert(faturalar).values({
      catiFirmaId: teklif.catiFirmaId,
      bagliFirmaId: Number(bagliFirmaId),
      gemiId: teklif.gemiId ?? null,
      faturaSerisiId: varsayilanSeri?.id ?? null,
      faturaNo,
      faturaAdi: `Teklif ${teklif.teklifNo}`,
      faturaTarihi: today,
      vadeTarihi,
      paraBirimi: teklif.paraBirimi,
      durum: "taslak",
      toplamTutar: String(toplamTutar),
      kdvTutari: "0",
      genelToplam: String(toplamTutar),
      notlar: teklif.notlar ?? null,
      aciklama: teklif.kosullar ?? null,
    }).returning();

    for (const k of faturaKalemRows) {
      await db.insert(faturaKalemleri).values({ faturaId: fatura.id, ...k });
    }

    res.status(201).json({ faturaId: fatura.id, faturaNo: fatura.faturaNo });
  } catch (err) {
    console.error("[faturaya-donustur] error:", err);
    res.status(500).json({ error: "Faturaya dönüştürme başarısız" });
  }
});

// ── PDF ───────────────────────────────────────────────────────────────────
router.get("/teklifler/:id/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ t: teklifler, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad, gemiImo: gemiler.imoNumarasi })
      .from(teklifler)
      .leftJoin(firmalar, eq(teklifler.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(teklifler.gemiId, gemiler.id))
      .where(eq(teklifler.id, id));
    if (!row) { res.status(404).json({ error: "Teklif bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.t.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const [catiFirmaRow] = await db.select().from(firmalar).where(eq(firmalar.id, row.t.catiFirmaId));
    const kalemler = await db.select().from(teklifKalemleri).where(eq(teklifKalemleri.teklifId, id)).orderBy(teklifKalemleri.sira);
    const bankalar = await db.select().from(bankaHesaplari).where(and(eq(bankaHesaplari.catiFirmaId, row.t.catiFirmaId), eq(bankaHesaplari.faturadaGoster, true)));

    const t = row.t;
    const zorunluKalemler = kalemler.filter(k => !k.opsiyonel);
    const opsKalemler = kalemler.filter(k => k.opsiyonel);

    const araToplam = zorunluKalemler.reduce((s, k) => s + Number(k.miktar) * Number(k.birimFiyat), 0);
    const opsToplamTutar = opsKalemler.reduce((s, k) => s + Number(k.miktar) * Number(k.birimFiyat), 0);
    const toplamYazi = sayiyiIngilizceYaz(araToplam, t.paraBirimi);

    const paraBirimiSiralama = ["TRY", "USD", "EUR", "GBP"];
    const bankalarGruplu = bankalar.reduce<Record<string, typeof bankalar>>((acc, b) => {
      (acc[b.paraBirimi] ??= []).push(b); return acc;
    }, {});
    const paraBirimleri = [
      ...paraBirimiSiralama.filter(pb => bankalarGruplu[pb]),
      ...Object.keys(bankalarGruplu).filter(pb => !paraBirimiSiralama.includes(pb)),
    ];
    const bankaBilgileri = paraBirimleri.map(pb =>
      `— ${pb} ACCOUNTS —\n` + bankalarGruplu[pb].map(b =>
        `${b.bankaAdi}: ${b.hesapAdi}${b.iban ? `\nIBAN: ${b.iban}` : ""}`
      ).join("\n")
    ).join("\n\n");

    let satirNo = 0;
    const kalemSatiri = (k: typeof kalemler[number]): TableCell[] => {
      satirNo++;
      return [
        { text: String(satirNo), alignment: "center" },
        { text: k.aciklama },
        { text: String(k.birim ?? "Adet"), alignment: "center" },
        { text: Number(k.miktar).toFixed(2), alignment: "right" },
        { text: Number(k.birimFiyat).toFixed(2), alignment: "right" },
        { text: (Number(k.miktar) * Number(k.birimFiyat)).toFixed(2), alignment: "right" },
      ];
    };

    const tabloLayout = {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i === 0 || i === 1 ? "#0070d1" : "#e8eaf0"),
      fillColor: (i: number) => (i === 0 ? "#0070d1" : i % 2 === 0 ? "#f9fafc" : null),
    };

    const docDefinition: TDocumentDefinitions = {
      defaultStyle: { font: "Roboto", fontSize: 10 },
      pageMargins: [40, 60, 40, 60],
      content: [
        {
          columns: [
            catiFirmaRow?.logo
              ? { image: catiFirmaRow.logo, width: 180, marginBottom: 4 }
              : {
                  stack: [
                    { text: catiFirmaRow?.ad ?? row.catiFirmaAd ?? "", style: "sirketAd" },
                    ...(catiFirmaRow?.adres ? [{ text: catiFirmaRow.adres, color: "#555", fontSize: 9, marginTop: 2 }] : []),
                    ...((catiFirmaRow?.telefon || catiFirmaRow?.eposta) ? [{ text: [catiFirmaRow?.telefon, catiFirmaRow?.eposta].filter(Boolean).join("  |  "), color: "#555", fontSize: 9, marginTop: 1 }] : []),
                  ],
                },
            {
              stack: [
                { text: catiFirmaRow?.ad ?? row.catiFirmaAd ?? "", style: "sirketAd", alignment: "right" },
                ...((catiFirmaRow?.telefon || catiFirmaRow?.eposta) ? [{ text: [catiFirmaRow?.telefon, catiFirmaRow?.eposta].filter(Boolean).join("  |  "), color: "#555", fontSize: 9, marginTop: 1, alignment: "right" }] : []),
                ...(catiFirmaRow?.vergiNo ? [{ text: `Tax No: ${catiFirmaRow.vergiNo}${catiFirmaRow.vergiDairesi ? ` — ${catiFirmaRow.vergiDairesi}` : ""}`, color: "#555", fontSize: 9, marginTop: 1, alignment: "right" }] : []),
              ],
              width: "*",
            },
          ],
          marginBottom: 16,
        },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: "#0070d1" }], marginBottom: 16 },
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "TO", style: "bolumBaslik" },
                { text: t.aliciAd, bold: true, marginTop: 4 },
                ...(t.aliciAdres ? [{ text: t.aliciAdres, color: "#555", fontSize: 9, marginTop: 2 }] : []),
                ...(t.aliciTelefon ? [{ text: t.aliciTelefon, color: "#555", fontSize: 9, marginTop: 1 }] : []),
              ],
            },
            {
              width: "auto",
              stack: [
                { text: "PROFORMA QUOTATION", fontSize: 18, bold: true, color: "#0070d1", alignment: "right" },
                { text: `No: ${t.teklifNo}`, fontSize: 10, color: "#555", alignment: "right", marginTop: 4 },
              ],
            },
          ],
          marginBottom: 20,
        },
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "QUOTATION DETAILS", style: "bolumBaslik" },
                { text: `Date: ${t.tarih}`, marginTop: 4 },
                ...(t.gecerlilikTarihi ? [{ text: `Valid Until: ${t.gecerlilikTarihi}`, marginTop: 2 }] : []),
                { text: `Currency: ${t.paraBirimi}`, marginTop: 2 },
                ...(t.kurNotu ? [{ text: `Rate Note: ${t.kurNotu}`, color: "#555", fontSize: 9, marginTop: 2 }] : []),
              ],
            },
            ...(row.gemiAd ? [{
              width: "*",
              stack: [
                { text: "VESSEL", style: "bolumBaslik" },
                { text: row.gemiAd, bold: true, marginTop: 4 },
                ...(row.gemiImo ? [{ text: `IMO: ${row.gemiImo}`, color: "#555", fontSize: 9, marginTop: 1 }] : []),
              ],
              alignment: "right",
            }] : []),
          ],
          marginBottom: 20,
        },
        {
          table: {
            headerRows: 1,
            widths: [24, "*", 44, 40, 64, 64],
            body: ([
              [
                { text: "#", style: "tabloBaslik", alignment: "center" },
                { text: "Description", style: "tabloBaslik" },
                { text: "Unit", style: "tabloBaslik", alignment: "center" },
                { text: "Qty", style: "tabloBaslik", alignment: "right" },
                { text: "Unit Price", style: "tabloBaslik", alignment: "right" },
                { text: "Amount", style: "tabloBaslik", alignment: "right" },
              ],
              ...zorunluKalemler.map(kalemSatiri),
            ] as unknown as TableCell[][]),
          },
          layout: tabloLayout,
          marginBottom: 8,
        },
        ...(opsKalemler.length > 0 ? [
          { text: "OPTIONAL ITEMS", style: "bolumBaslik", marginTop: 16, marginBottom: 6 } as unknown as import("pdfmake/interfaces").Content,
          {
            table: {
              headerRows: 1,
              widths: [24, "*", 44, 40, 64, 64],
              body: ([
                [
                  { text: "#", style: "tabloBaslik", alignment: "center" },
                  { text: "Description", style: "tabloBaslik" },
                  { text: "Unit", style: "tabloBaslik", alignment: "center" },
                  { text: "Qty", style: "tabloBaslik", alignment: "right" },
                  { text: "Unit Price", style: "tabloBaslik", alignment: "right" },
                  { text: "Amount", style: "tabloBaslik", alignment: "right" },
                ],
                ...opsKalemler.map(kalemSatiri),
                [
                  { text: "Optional Total:", colSpan: 5, alignment: "right", bold: true, color: "#555" }, {}, {}, {}, {},
                  { text: `${opsToplamTutar.toFixed(2)} ${t.paraBirimi}`, alignment: "right", bold: true, color: "#555" },
                ],
              ] as unknown as TableCell[][]),
            },
            layout: { ...tabloLayout, hLineColor: (i: number) => (i === 0 || i === 1 ? "#aaa" : "#e8eaf0"), fillColor: (i: number) => (i === 0 ? "#aaa" : i % 2 === 0 ? "#f9fafc" : null) },
            marginBottom: 8,
          } as unknown as import("pdfmake/interfaces").Content,
        ] : []),
        {
          columns: [
            { width: "*", text: "" },
            {
              width: 240,
              table: {
                widths: ["*", "auto"],
                body: [
                  [{ text: "TOTAL AMOUNT:", bold: true, fontSize: 11, color: "#0070d1" }, { text: `${araToplam.toFixed(2)} ${t.paraBirimi}`, alignment: "right", bold: true, fontSize: 11, color: "#0070d1" }],
                ],
              },
              layout: {
                hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 2 : 0),
                vLineWidth: () => 0,
                hLineColor: () => "#0070d1",
              },
            },
          ],
          marginBottom: 8,
        },
        { text: `Amount in words: ${toplamYazi}`, italics: true, color: "#555", fontSize: 9, marginBottom: 16 },
        ...(bankaBilgileri ? [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#e8eaf0" }] } as unknown as import("pdfmake/interfaces").Content,
          { text: "BANK DETAILS", style: "bolumBaslik", marginBottom: 6 },
          { text: bankaBilgileri, fontSize: 9, color: "#333", lineHeight: 1.4 },
        ] : []),
        ...(t.notlar ? [{ text: t.notlar, marginTop: 16, color: "#555", italics: true, fontSize: 9 }] : []),
        ...(t.kosullar ? [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#e8eaf0" }], marginTop: 20 } as unknown as import("pdfmake/interfaces").Content,
          { text: "TERMS & CONDITIONS", style: "bolumBaslik", marginBottom: 4 },
          { text: t.kosullar, fontSize: 9, color: "#333", lineHeight: 1.4 },
        ] : []),
      ],
      styles: {
        sirketAd: { fontSize: 16, bold: true, color: "#0070d1" },
        bolumBaslik: { fontSize: 8, bold: true, color: "#888", characterSpacing: 1 },
        tabloBaslik: { bold: true, color: "#ffffff", fillColor: "#0070d1" },
      },
      footer: (currentPage: number, pageCount: number) => ({
        stack: [
          { canvas: [{ type: "line", x1: 40, y1: 0, x2: 555, y2: 0, lineWidth: 0.5, lineColor: "#e8eaf0" }] },
          {
            columns: [
              { text: `${catiFirmaRow?.ad ?? ""}${catiFirmaRow?.adres ? "  ·  " + catiFirmaRow.adres : ""}`, fontSize: 7.5, color: "#aaa", alignment: "left", margin: [40, 4, 0, 0] },
              { text: "< TOOV />", fontSize: 8, bold: true, color: "#0070d1", alignment: "center", margin: [0, 4, 0, 0] },
              { text: `${currentPage} / ${pageCount}`, fontSize: 7.5, color: "#aaa", alignment: "right", margin: [0, 4, 40, 0] },
            ],
          },
        ],
        margin: [0, 4, 0, 0],
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfStream: NodeJS.ReadableStream & { end(): void } = await _pdfmake.createPdf(docDefinition).getStream();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="teklif-${t.teklifNo}.pdf"`);
    pdfStream.pipe(res);
    pdfStream.end();
  } catch (err) {
    console.error("[teklifler/pdf] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Teklif PDF oluşturulamadı" });
  }
});

// ── HELPERS ───────────────────────────────────────────────────────────────
function formatTeklif(
  t: typeof teklifler.$inferSelect,
  catiFirmaAd: string | null | undefined,
  gemiAd: string | null | undefined,
) {
  return {
    id: t.id, catiFirmaId: t.catiFirmaId, catiFirmaAd: catiFirmaAd ?? null,
    gemiId: t.gemiId, gemiAd: gemiAd ?? null,
    teklifNo: t.teklifNo, tarih: t.tarih, gecerlilikTarihi: t.gecerlilikTarihi,
    aliciAd: t.aliciAd, aliciAdres: t.aliciAdres, aliciTelefon: t.aliciTelefon,
    paraBirimi: t.paraBirimi, kurNotu: t.kurNotu,
    notlar: t.notlar, kosullar: t.kosullar, durum: t.durum,
    olusturmaTarihi: t.olusturmaTarihi, guncellenmeTarihi: t.guncellenmeTarihi,
  };
}

const PARA_BIRIMI_ADLARI: Record<string, { tekil: string; cogul: string; altTekil: string; altCogul: string }> = {
  USD: { tekil: "US Dollar", cogul: "US Dollars", altTekil: "Cent", altCogul: "Cents" },
  EUR: { tekil: "Euro", cogul: "Euros", altTekil: "Cent", altCogul: "Cents" },
  GBP: { tekil: "Pound Sterling", cogul: "Pounds Sterling", altTekil: "Penny", altCogul: "Pence" },
  TRY: { tekil: "Turkish Lira", cogul: "Turkish Lira", altTekil: "Kurus", altCogul: "Kurus" },
};

function ucBasamakYaz(n: number): string {
  const birler = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const onlar10_19 = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const onlar = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const parcalar: string[] = [];
  const yuz = Math.floor(n / 100);
  const kalan = n % 100;
  if (yuz > 0) parcalar.push(`${birler[yuz]} hundred`);
  if (kalan >= 10 && kalan <= 19) { parcalar.push(onlar10_19[kalan - 10]); }
  else {
    const o = Math.floor(kalan / 10);
    const b = kalan % 10;
    if (o > 0) parcalar.push(onlar[o]);
    if (b > 0) parcalar.push(birler[b]);
  }
  return parcalar.join(" ");
}

function tamSayiYaz(n: number): string {
  if (n === 0) return "zero";
  const gruplar = ["", "thousand", "million", "billion"];
  const parcalar: string[] = [];
  let grup = 0;
  let kalan = n;
  while (kalan > 0) {
    const ucBasamak = kalan % 1000;
    if (ucBasamak > 0) {
      const yazi = ucBasamakYaz(ucBasamak);
      parcalar.unshift(grup > 0 ? `${yazi} ${gruplar[grup]}` : yazi);
    }
    kalan = Math.floor(kalan / 1000);
    grup++;
  }
  return parcalar.join(" ");
}

function sayiyiIngilizceYaz(tutar: number, paraBirimi: string): string {
  const pb = PARA_BIRIMI_ADLARI[paraBirimi] ?? { tekil: paraBirimi, cogul: paraBirimi, altTekil: "Cent", altCogul: "Cents" };
  const tamKisim = Math.floor(tutar);
  const kusurat = Math.round((tutar - tamKisim) * 100);
  const tamYazi = tamSayiYaz(tamKisim);
  const tamBirim = tamKisim === 1 ? pb.tekil : pb.cogul;
  let sonuc = `${tamYazi} ${tamBirim}`;
  if (kusurat > 0) {
    const altBirim = kusurat === 1 ? pb.altTekil : pb.altCogul;
    sonuc += ` and ${tamSayiYaz(kusurat)} ${altBirim}`;
  }
  sonuc += " only";
  return sonuc.charAt(0).toUpperCase() + sonuc.slice(1);
}

export default router;
