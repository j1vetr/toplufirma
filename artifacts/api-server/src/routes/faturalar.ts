import { Router } from "express";
import { db } from "@workspace/db";
import {
  faturalar, faturaKalemleri,
  sirketler, cariler, gemiler, odemeler, faturaSerileri
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

router.get("/faturalar", async (req, res) => {
  try {
    const { sirketId, cariId, durum, paraBirimi, baslangicTarihi, bitisTarihi } = req.query as Record<string, string>;

    let rows = await db
      .select({
        f: faturalar,
        sirketAd: sirketler.ad,
        cariAd: cariler.ad,
        gemiAd: gemiler.ad,
      })
      .from(faturalar)
      .leftJoin(sirketler, eq(faturalar.sirketId, sirketler.id))
      .leftJoin(cariler, eq(faturalar.cariId, cariler.id))
      .leftJoin(gemiler, eq(faturalar.gemiId, gemiler.id))
      .orderBy(faturalar.faturaTarihi);

    if (sirketId) rows = rows.filter(r => r.f.sirketId === Number(sirketId));
    if (cariId) rows = rows.filter(r => r.f.cariId === Number(cariId));
    if (durum) rows = rows.filter(r => r.f.durum === durum);
    if (paraBirimi) rows = rows.filter(r => r.f.paraBirimi === paraBirimi);
    if (baslangicTarihi) rows = rows.filter(r => r.f.faturaTarihi >= baslangicTarihi);
    if (bitisTarihi) rows = rows.filter(r => r.f.faturaTarihi <= bitisTarihi);

    const odenenler = await hesaplaOdenenler();
    res.json(rows.map(r => formatFatura(r.f, r.sirketAd, r.cariAd, r.gemiAd, odenenler[r.f.id] ?? 0)));
  } catch (err) {
    res.status(500).json({ error: "Faturalar listelenemedi" });
  }
});

router.post("/faturalar", async (req, res) => {
  try {
    const { sirketId, cariId, gemiId, faturaSerisiId, faturaTarihi, vadeTarihi, paraBirimi, notlar, aciklama, kalemler } = req.body;
    if (!sirketId || !cariId || !faturaTarihi || !vadeTarihi || !kalemler?.length)
      return res.status(400).json({ error: "Zorunlu alanlar eksik" });

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
      toplamTutar += ara;
      kdvTutari += kdv;
      kalemRows.push({ aciklama: k.aciklama, miktar: String(k.miktar), birimFiyat: String(k.birimFiyat), kdvOrani: String(k.kdvOrani), araToplam: String(ara), kdvTutari: String(kdv), genelToplam: String(ara + kdv) });
    }

    const [fatura] = await db.insert(faturalar).values({
      sirketId, cariId, gemiId: gemiId ?? null, faturaSerisiId: faturaSerisiId ?? null,
      faturaNo, faturaTarihi, vadeTarihi, paraBirimi: paraBirimi ?? "USD",
      durum: "acik",
      toplamTutar: String(toplamTutar),
      kdvTutari: String(kdvTutari),
      genelToplam: String(toplamTutar + kdvTutari),
      notlar, aciklama,
    }).returning();

    for (const k of kalemRows) {
      await db.insert(faturaKalemleri).values({ faturaId: fatura.id, ...k });
    }

    res.status(201).json(formatFatura(fatura, null, null, null, 0));
  } catch (err) {
    res.status(500).json({ error: "Fatura oluşturulamadı" });
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
        odemeYontemi: o.odemeYontemi, aciklama: o.aciklama,
        olusturmaTarihi: o.olusturmaTarihi,
        sirketAd: null, cariAd: null, gemiId: o.gemiId, gemiAd: null,
        bankaHesabiId: o.bankaHesabiId, bankaHesabiAd: null, faturaNo: row.f.faturaNo,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Fatura getirilemedi" });
  }
});

router.patch("/faturalar/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { vadeTarihi, notlar, aciklama, durum } = req.body;
    const [row] = await db.update(faturalar)
      .set({ vadeTarihi, notlar, aciklama, durum })
      .where(eq(faturalar.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Fatura bulunamadı" });
    res.json(formatFatura(row, null, null, null, 0));
  } catch (err) {
    res.status(500).json({ error: "Fatura güncellenemedi" });
  }
});

router.delete("/faturalar/:id", async (req, res) => {
  try {
    await db.delete(faturalar).where(eq(faturalar.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Fatura silinemedi" });
  }
});

async function hesaplaOdenenler(): Promise<Record<number, number>> {
  const rows = await db
    .select({ faturaId: odemeler.faturaId, toplam: sql<string>`sum(${odemeler.tutar})` })
    .from(odemeler)
    .where(sql`${odemeler.faturaId} is not null`)
    .groupBy(odemeler.faturaId);
  const result: Record<number, number> = {};
  for (const r of rows) {
    if (r.faturaId != null) result[r.faturaId] = Number(r.toplam ?? 0);
  }
  return result;
}

function formatFatura(
  f: typeof faturalar.$inferSelect,
  sirketAd: string | null | undefined,
  cariAd: string | null | undefined,
  gemiAd: string | null | undefined,
  odenen: number
) {
  const genel = Number(f.genelToplam);
  return {
    id: f.id,
    sirketId: f.sirketId, sirketAd: sirketAd ?? null,
    cariId: f.cariId, cariAd: cariAd ?? null,
    gemiId: f.gemiId, gemiAd: gemiAd ?? null,
    faturaNo: f.faturaNo,
    faturaTarihi: f.faturaTarihi,
    vadeTarihi: f.vadeTarihi,
    paraBirimi: f.paraBirimi,
    durum: f.durum,
    toplamTutar: Number(f.toplamTutar),
    kdvTutari: Number(f.kdvTutari),
    genelToplam: genel,
    odenenTutar: odenen,
    kalanTutar: Math.max(0, genel - odenen),
    notlar: f.notlar,
    aciklama: f.aciklama,
    olusturmaTarihi: f.olusturmaTarihi,
  };
}

export default router;
