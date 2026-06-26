import { Router } from "express";
import { db } from "@workspace/db";
import { faturalar, faturaKalemleri, firmalar, gemiler, odemeler, faturaSerileri, bankaHesaplari, firmaEpostaAyarlari, tekrarlayanFaturalar, tekrarlayanFaturaKalemleri, gonderiGecmisi } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele, firmaYazmaDenetimi } from "../middleware/auth";
import nodemailer from "nodemailer";
import { emailSablonuOlustur } from "../lib/emailSablonu";
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
    res.json(rows.map(r => formatFatura(r.f, r.catiFirmaAd, bagliAds[r.f.bagliFirmaId ?? 0], r.gemiAd, odenenler[r.f.id] ?? 0, r.f.grupFirmaId ? bagliAds[r.f.grupFirmaId] ?? null : null)));
  } catch {
    res.status(500).json({ error: "Faturalar listelenemedi" });
  }
});

router.post("/faturalar", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, bagliFirmaId, grupFirmaId, gemiId, faturaSerisiId, faturaAdi, faturaTarihi, vadeTarihi, paraBirimi, notlar, aciklama, kalemler, tekrarlat } = req.body;
    req.log.info({ catiFirmaId, bagliFirmaId, grupFirmaId, gemiId, faturaTarihi, vadeTarihi, kalemSayisi: kalemler?.length }, "[fatura-yeni] body alındı");
    if (!catiFirmaId || !bagliFirmaId || !faturaTarihi || !vadeTarihi || !kalemler?.length) {
      req.log.warn({ catiFirmaId, bagliFirmaId, faturaTarihi, vadeTarihi, kalemSayisi: kalemler?.length }, "[fatura-yeni] zorunlu alan eksik");
      res.status(400).json({ error: "Zorunlu alanlar eksik" }); return;
    }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const [bagliFirma] = await db.select({ uid: firmalar.ustFirmaId }).from(firmalar).where(eq(firmalar.id, Number(bagliFirmaId)));
    req.log.info({ bagliFirmaId, bulunanUstFirmaId: bagliFirma?.uid ?? null, catiFirmaId }, "[fatura-yeni] bağlı firma kontrolü");
    if (!bagliFirma || (bagliFirma.uid !== null && bagliFirma.uid !== Number(catiFirmaId))) {
      req.log.warn({ bagliFirmaId, bulunanUstFirmaId: bagliFirma?.uid ?? null, catiFirmaId }, "[fatura-yeni] bağlı firma eşleşmedi");
      res.status(400).json({ error: "Belirtilen bağlı firma bu çatı firmaya ait değil" }); return;
    }

    if (grupFirmaId) {
      const [grup] = await db.select({ tip: firmalar.tip }).from(firmalar).where(eq(firmalar.id, Number(grupFirmaId)));
      if (!grup || grup.tip !== "grup") {
        req.log.warn({ grupFirmaId, tip: grup?.tip }, "[fatura-yeni] grup firma geçersiz");
        res.status(400).json({ error: "Belirtilen çatı (grup) firma geçersiz" }); return;
      }
    }

    if (gemiId) {
      const [gemiRow] = await db.select({ uid: firmalar.ustFirmaId })
        .from(gemiler).leftJoin(firmalar, eq(gemiler.firmaId, firmalar.id))
        .where(eq(gemiler.id, Number(gemiId)));
      if (!gemiRow || (gemiRow.uid !== null && gemiRow.uid !== Number(catiFirmaId))) {
        req.log.warn({ gemiId, gemiUstFirmaId: gemiRow?.uid ?? null, catiFirmaId }, "[fatura-yeni] gemi eşleşmedi");
        res.status(400).json({ error: "Belirtilen gemi bu firmaya ait değil" }); return;
      }
    }

    let faturaNo = "";
    if (faturaSerisiId) {
      const [seri] = await db.select().from(faturaSerileri).where(eq(faturaSerileri.id, faturaSerisiId));
      if (!seri || seri.catiFirmaId !== Number(catiFirmaId)) {
        req.log.warn({ faturaSerisiId, seriCatiFirmaId: seri?.catiFirmaId, catiFirmaId }, "[fatura-yeni] seri eşleşmedi");
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
    for (const k of kalemler as { aciklama: string; miktar: number; birimFiyat: number; kdvOrani: number; birim?: string }[]) {
      const ara = k.miktar * k.birimFiyat;
      const kdv = ara * (k.kdvOrani / 100);
      toplamTutar += ara; kdvTutari += kdv;
      kalemRows.push({ aciklama: k.aciklama, birim: k.birim ?? "Pcs", miktar: String(k.miktar), birimFiyat: String(k.birimFiyat), kdvOrani: String(k.kdvOrani), araToplam: String(ara), kdvTutari: String(kdv), genelToplam: String(ara + kdv) });
    }

    const [fatura] = await db.insert(faturalar).values({
      catiFirmaId, bagliFirmaId, grupFirmaId: grupFirmaId ? Number(grupFirmaId) : null,
      gemiId: gemiId ?? null, faturaSerisiId: faturaSerisiId ?? null,
      faturaNo, faturaAdi: faturaAdi ?? null, faturaTarihi, vadeTarihi, paraBirimi: paraBirimi ?? "USD",
      durum: "acik", toplamTutar: String(toplamTutar), kdvTutari: String(kdvTutari),
      genelToplam: String(toplamTutar + kdvTutari), notlar, aciklama,
    }).returning();

    for (const k of kalemRows) {
      await db.insert(faturaKalemleri).values({ faturaId: fatura.id, ...k });
    }

    if (tekrarlat) {
      const ilkKalem = (kalemler as { aciklama: string; miktar: number; birimFiyat: number; kdvOrani: number }[])[0];
      const sonraki = new Date(faturaTarihi);
      sonraki.setMonth(sonraki.getMonth() + 1);
      const [tr] = await db.insert(tekrarlayanFaturalar).values({
        catiFirmaId, bagliFirmaId, grupFirmaId: grupFirmaId ? Number(grupFirmaId) : null, gemiId: gemiId ?? null,
        aciklama: aciklama ?? ilkKalem.aciklama,
        birimFiyat: String(ilkKalem.birimFiyat),
        kdvOrani: String(ilkKalem.kdvOrani),
        paraBirimi: paraBirimi ?? "USD",
        sonrakiTarih: sonraki.toISOString().split("T")[0],
        aktif: true,
      }).returning();

      for (const k of kalemler as { aciklama: string; miktar: number; birimFiyat: number; kdvOrani: number; birim?: string }[]) {
        await db.insert(tekrarlayanFaturaKalemleri).values({
          tekrarlayanFaturaId: tr.id,
          aciklama: k.aciklama,
          birim: k.birim ?? "Pcs",
          miktar: String(k.miktar),
          birimFiyat: String(k.birimFiyat),
          kdvOrani: String(k.kdvOrani),
        });
      }
    }

    res.status(201).json(formatFatura(fatura, null, null, null, 0));
  } catch {
    res.status(500).json({ error: "Fatura oluşturulamadı" });
  }
});

router.patch("/faturalar/toplu-durum", requireYazma, async (req, res) => {
  try {
    const { ids, durum } = req.body as { ids?: number[]; durum?: string };
    if (!ids?.length || !durum) { res.status(400).json({ error: "ids ve durum zorunludur" }); return; }
    const izinliDurumlar = ["taslak", "acik", "kismi_odendi", "odendi", "iptal"];
    if (!izinliDurumlar.includes(durum)) { res.status(400).json({ error: "Geçersiz durum" }); return; }

    let guncellenen = 0;
    for (const id of ids) {
      const [existing] = await db.select().from(faturalar).where(eq(faturalar.id, id));
      if (!existing) continue;
      if (!sirketErisimKontrol(existing.catiFirmaId, req)) continue;
      if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) continue;
      await db.update(faturalar)
        .set({ durum: durum as typeof faturalar.$inferSelect["durum"] })
        .where(eq(faturalar.id, id));
      guncellenen++;
    }
    res.json({ guncellenen });
  } catch {
    res.status(500).json({ error: "Toplu güncelleme başarısız" });
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
      .select({ f: faturalar, catiFirmaAd: firmalar.ad, catiFirmaLogoUrl: firmalar.logo, gemiAd: gemiler.ad, gemiImo: gemiler.imoNumarasi })
      .from(faturalar)
      .leftJoin(firmalar, eq(faturalar.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .where(eq(faturalar.id, id));
    if (!row) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.f.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const [bagliRow] = row.f.bagliFirmaId ? await db.select({ ad: firmalar.ad, adres: firmalar.adres }).from(firmalar).where(eq(firmalar.id, row.f.bagliFirmaId)) : [undefined];
    const bagliFirmaAd = bagliRow?.ad ?? null;
    const bagliFirmaAdres = bagliRow?.adres ?? null;
    const grupFirmaAd = row.f.grupFirmaId ? (await db.select({ ad: firmalar.ad }).from(firmalar).where(eq(firmalar.id, row.f.grupFirmaId)))[0]?.ad ?? null : null;
    const kalemler = await db.select().from(faturaKalemleri).where(eq(faturaKalemleri.faturaId, id));
    const ods = await db.select().from(odemeler).where(eq(odemeler.faturaId, id));
    const odenen = ods.filter(o => o.tip === "tahsilat").reduce((s, o) => s + Number(o.tutar), 0);

    res.json({
      ...formatFatura(row.f, row.catiFirmaAd, bagliFirmaAd, row.gemiAd, odenen, grupFirmaAd),
      catiFirmaLogoUrl: row.catiFirmaLogoUrl ?? null,
      bagliFirmaAdres,
      gemiAdImo: row.gemiAd ? `${row.gemiAd}${row.gemiImo ? ` (${row.gemiImo})` : ""}` : null,
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
      .select({ f: faturalar, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad, gemiImo: gemiler.imoNumarasi })
      .from(faturalar)
      .leftJoin(firmalar, eq(faturalar.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .where(eq(faturalar.id, id));
    if (!row) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.f.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const [catiFirmaRow] = await db.select().from(firmalar).where(eq(firmalar.id, row.f.catiFirmaId));
    const [bagliFirmaRow] = row.f.bagliFirmaId ? await db.select({ ad: firmalar.ad, adres: firmalar.adres }).from(firmalar).where(eq(firmalar.id, row.f.bagliFirmaId)) : [undefined];
    const bagliFirmaAd = bagliFirmaRow?.ad ?? null;
    const bagliFirmaAdres = bagliFirmaRow?.adres ?? null;
    const gemiAd = row.gemiAd ?? null;
    const gemiImo = row.gemiImo ?? null;
    const kalemler = await db.select().from(faturaKalemleri).where(eq(faturaKalemleri.faturaId, id));
    const ods = await db.select().from(odemeler).where(eq(odemeler.faturaId, id));
    const odenen = ods.filter(o => o.tip === "tahsilat").reduce((s, o) => s + Number(o.tutar), 0);
    const bankalar = await db.select().from(bankaHesaplari).where(and(eq(bankaHesaplari.catiFirmaId, row.f.catiFirmaId), eq(bankaHesaplari.faturadaGoster, true)));
    const f = row.f;

    const durumEtiket = f.durum === "odendi" ? "PAID" : f.durum === "acik" ? "UNPAID" : "PARTIALLY PAID";
    const kalan = Math.max(0, Number(f.genelToplam) - odenen);
    const tutarYazi = sayiyiIngilizceYaz(Number(f.genelToplam), f.paraBirimi);

    const bankaIcerikleri = bankalar.map(b => {
      const ibanlar = (b.ibanlar && Object.keys(b.ibanlar as Record<string, string>).length > 0)
        ? (b.ibanlar as Record<string, string>)
        : (b.iban && b.paraBirimi ? { [b.paraBirimi]: b.iban } : {});
      const satirlar: [string, string][] = [];
      if (b.bankaAdi) satirlar.push(["Bank Name", b.bankaAdi]);
      if (b.hesapAdi) satirlar.push(["Account Name", b.hesapAdi]);
      for (const [pb, iban] of Object.entries(ibanlar)) {
        satirlar.push([`${pb} IBAN`, iban]);
      }
      if (b.swift) satirlar.push(["SWIFT", b.swift]);
      return {
        table: {
          widths: [90, "*"],
          body: satirlar.map(([label, value]) => [
            { text: label, bold: true, fontSize: 10 },
            { text: value, fontSize: 10 },
          ]),
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: (i: number) => i === 0 ? 0 : 2, paddingBottom: () => 2 },
        marginBottom: 12,
      };
    });

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
                ...(catiFirmaRow?.adres ? [{ text: catiFirmaRow.adres, color: "#555", fontSize: 9, marginTop: 2, alignment: "right" }] : []),
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
                { text: "BILL TO", style: "bolumBaslik" },
                { text: bagliFirmaAd ?? "-", bold: true, marginTop: 4 },
                ...(bagliFirmaAdres ? [{ text: bagliFirmaAdres, color: "#555", fontSize: 9, marginTop: 2 }] : []),
                ...(f.faturaAdi ? [{ text: f.faturaAdi, color: "#555", fontSize: 9, marginTop: 2 }] : []),
                { text: `INVOICE  ${f.faturaNo}`, fontSize: 8, bold: true, color: "#0070d1", marginTop: 8, characterSpacing: 0.5 },
              ],
            },
            {
              width: "*",
              stack: [
                { text: "INVOICE DETAILS", style: "bolumBaslik" },
                {
                  marginTop: 6,
                  table: {
                    widths: ["auto", "*"],
                    body: ([
                      [{ text: "Invoice Date:", bold: true }, { text: f.faturaTarihi, alignment: "right" }],
                      ...(gemiAd ? [[{ text: "Ship Name:", bold: true }, { text: gemiAd, alignment: "right" }]] : []),
                      ...(gemiImo ? [[{ text: "Ship IMO:", bold: true }, { text: String(gemiImo), alignment: "right" }]] : []),
                      [{ text: "Due Date:", bold: true }, { text: f.vadeTarihi, alignment: "right" }],
                      [{ text: "Currency:", bold: true }, { text: f.paraBirimi, alignment: "right" }],
                    ] as TableCell[][]),
                  },
                  layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: (i: number) => i === 0 ? 0 : 3, paddingBottom: () => 3 },
                },
              ],
              alignment: "right",
            },
          ],
          marginBottom: 20,
        },
        (() => {
          const kdvYok = kalemler.every(k => Number(k.kdvOrani) === 0);
          const tableWidths = kdvYok ? ["*", 35, 45, 70, 70] : ["*", 35, 45, 65, 40, 65];
          const headerRow = kdvYok
            ? [
                { text: "Description", style: "tabloBaslik" },
                { text: "Unit", style: "tabloBaslik" },
                { text: "Qty", style: "tabloBaslik", alignment: "right" },
                { text: "Unit Price", style: "tabloBaslik", alignment: "right" },
                { text: "Total", style: "tabloBaslik", alignment: "right" },
              ]
            : [
                { text: "Description", style: "tabloBaslik" },
                { text: "Unit", style: "tabloBaslik" },
                { text: "Qty", style: "tabloBaslik", alignment: "right" },
                { text: "Unit Price", style: "tabloBaslik", alignment: "right" },
                { text: "VAT %", style: "tabloBaslik", alignment: "right" },
                { text: "Total", style: "tabloBaslik", alignment: "right" },
              ];
          const dataRows = kalemler.map(k => kdvYok
            ? [
                { text: k.aciklama },
                { text: k.birim ?? "Pcs" },
                { text: Number(k.miktar).toFixed(2), alignment: "right" },
                { text: Number(k.birimFiyat).toFixed(2), alignment: "right" },
                { text: Number(k.genelToplam).toFixed(2), alignment: "right" },
              ]
            : [
                { text: k.aciklama },
                { text: k.birim ?? "Pcs" },
                { text: Number(k.miktar).toFixed(2), alignment: "right" },
                { text: Number(k.birimFiyat).toFixed(2), alignment: "right" },
                { text: `${Number(k.kdvOrani).toFixed(0)}%`, alignment: "right" },
                { text: Number(k.genelToplam).toFixed(2), alignment: "right" },
              ]);
          return {
            table: {
              headerRows: 1,
              widths: tableWidths,
              body: ([headerRow, ...dataRows] as unknown as TableCell[][]),
            },
            layout: {
              hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
              vLineWidth: () => 0,
              hLineColor: (i: number) => (i === 0 || i === 1 ? "#0070d1" : "#e8eaf0"),
              fillColor: (i: number) => (i === 0 ? "#0070d1" : i % 2 === 0 ? "#f9fafc" : null),
            },
            marginBottom: 16,
          };
        })(),
        {
          columns: [
            { width: "*", text: "" },
            {
              width: 240,
              table: {
                widths: ["*", "auto"],
                body: [
                  [{ text: "Subtotal:", color: "#555" }, { text: `${Number(f.toplamTutar).toFixed(2)} ${f.paraBirimi}`, alignment: "right" }],
                  ...(kalemler.every(k => Number(k.kdvOrani) === 0) ? [] : [[{ text: "VAT Amount:", color: "#555" }, { text: `${Number(f.kdvTutari).toFixed(2)} ${f.paraBirimi}`, alignment: "right" }]]),
                  [{ text: "Grand Total:", bold: true }, { text: `${Number(f.genelToplam).toFixed(2)} ${f.paraBirimi}`, alignment: "right", bold: true }],
                  [{ text: "Paid:", color: "#555" }, { text: `${odenen.toFixed(2)} ${f.paraBirimi}`, alignment: "right" }],
                  [
                    { text: "BALANCE DUE:", bold: true, fontSize: 12, color: "#0070d1" },
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
          marginBottom: 12,
        },
        { text: `Amount in words: ${tutarYazi}`, italics: true, color: "#555", fontSize: 9, marginBottom: bankaIcerikleri.length > 0 ? 16 : 0 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(bankaIcerikleri.length > 0 ? [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#e8eaf0" }] } as unknown as import("pdfmake/interfaces").Content,
          { text: "PAYMENT DETAILS", style: "bolumBaslik", marginBottom: 8 } as unknown as import("pdfmake/interfaces").Content,
          ...bankaIcerikleri as unknown as import("pdfmake/interfaces").Content[],
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
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const { vadeTarihi, faturaAdi, grupFirmaId, notlar, aciklama, durum } = req.body;
    if (grupFirmaId !== undefined && grupFirmaId !== null) {
      const [grup] = await db.select({ tip: firmalar.tip }).from(firmalar).where(eq(firmalar.id, Number(grupFirmaId)));
      if (!grup || grup.tip !== "grup") { res.status(400).json({ error: "Belirtilen çatı (grup) firma geçersiz" }); return; }
    }
    const [row] = await db.update(faturalar)
      .set({
        vadeTarihi, notlar, aciklama, durum,
        ...(faturaAdi !== undefined ? { faturaAdi } : {}),
        ...(grupFirmaId !== undefined ? { grupFirmaId: grupFirmaId === null ? null : Number(grupFirmaId) } : {}),
      })
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
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
    await db.delete(faturalar).where(eq(faturalar.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Fatura silinemedi" });
  }
});

router.post("/faturalar/:id/gonder", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { aliciAdres, aliciAd, konu, mesaj } = req.body as { aliciAdres?: string; aliciAd?: string; konu?: string; mesaj?: string };
    if (!aliciAdres) { res.status(400).json({ error: "aliciAdres zorunludur" }); return; }

    const [row] = await db
      .select({
        f: faturalar,
        gemiAd: gemiler.ad,
        firmaAd: firmalar.ad,
        firmaLogo: firmalar.logo,
        firmaAdres: firmalar.adres,
        firmaTelefon: firmalar.telefon,
        firmaEposta: firmalar.eposta,
        firmaVergiNo: firmalar.vergiNo,
        firmaVergiDairesi: firmalar.vergiDairesi,
      })
      .from(faturalar)
      .leftJoin(firmalar, eq(faturalar.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .where(eq(faturalar.id, id));
    if (!row) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.f.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(row.f.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

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

    const firmaData = {
      ad: row.firmaAd ?? ayarlar.gonderenAd,
      logo: row.firmaLogo,
      adres: row.firmaAdres,
      telefon: row.firmaTelefon,
      eposta: row.firmaEposta,
      vergiNo: row.firmaVergiNo,
      vergiDairesi: row.firmaVergiDairesi,
    };
    const belgeData = {
      tip: "fatura" as const,
      no: row.f.faturaNo,
      tarih: row.f.faturaTarihi,
      vadeTarihi: row.f.vadeTarihi,
      toplamTutar: row.f.genelToplam ?? row.f.toplamTutar,
      paraBirimi: row.f.paraBirimi,
      gemiAd: row.gemiAd,
      durum: row.f.durum,
    };
    const { subject: autoSubject, html, text } = await emailSablonuOlustur(
      firmaData, belgeData, { ad: aliciAd, eposta: aliciAdres }, mesaj,
    );

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
      subject: konu?.trim() ? konu : autoSubject,
      html,
      text,
      attachments: [{ filename: `fatura-${faturaNo}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
    });

    await db.insert(gonderiGecmisi).values({
      kayitTipi: "fatura",
      kayitId: id,
      aliciEposta: aliciAdres,
      gonderenKullaniciId: req.kullanici?.id ?? null,
      gonderenAd: req.kullanici?.ad ?? null,
    });

    res.json({ mesaj: `Fatura ${faturaNo} adresine gönderildi: ${aliciAdres}` });
  } catch (err) {
    console.error("[gonder] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "E-posta gönderilemedi" });
  }
});

router.get("/faturalar/:id/gonderi-gecmisi", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [fatura] = await db.select({ catiFirmaId: faturalar.catiFirmaId }).from(faturalar).where(eq(faturalar.id, id));
    if (!fatura) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(fatura.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const gecmis = await db.select().from(gonderiGecmisi)
      .where(and(eq(gonderiGecmisi.kayitTipi, "fatura"), eq(gonderiGecmisi.kayitId, id)))
      .orderBy(gonderiGecmisi.gonderilmeTarihi);

    res.json(gecmis.map(g => ({
      id: g.id,
      aliciEposta: g.aliciEposta,
      gonderenAd: g.gonderenAd,
      gonderilmeTarihi: g.gonderilmeTarihi,
    })));
  } catch {
    res.status(500).json({ error: "Gönderim geçmişi alınamadı" });
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
  odenen: number,
  grupFirmaAd: string | null | undefined = null
) {
  const genel = Number(f.genelToplam);
  return {
    id: f.id, catiFirmaId: f.catiFirmaId, catiFirmaAd: catiFirmaAd ?? null,
    bagliFirmaId: f.bagliFirmaId, bagliFirmaAd: bagliFirmaAd ?? null,
    grupFirmaId: f.grupFirmaId, grupFirmaAd: grupFirmaAd ?? null,
    gemiId: f.gemiId, gemiAd: gemiAd ?? null,
    faturaNo: f.faturaNo, faturaAdi: f.faturaAdi, faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
    paraBirimi: f.paraBirimi, durum: f.durum,
    toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
    genelToplam: genel, odenenTutar: odenen, kalanTutar: Math.max(0, genel - odenen),
    notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
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
  if (kalan >= 10 && kalan <= 19) {
    parcalar.push(onlar10_19[kalan - 10]);
  } else {
    const o = Math.floor(kalan / 10);
    const b = kalan % 10;
    if (o > 0) parcalar.push(onlar[o]);
    if (b > 0) parcalar.push(birler[b]);
  }
  return parcalar.join(" ");
}

function tamSayiYaz(n: number): string {
  if (n === 0) return "zero";
  const gruplar = ["", "thousand", "million", "billion", "trillion"];
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
