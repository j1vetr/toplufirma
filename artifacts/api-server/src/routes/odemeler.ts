import { Router } from "express";
import { db } from "@workspace/db";
import { odemeler, sirketler, cariler, gemiler, bankaHesaplari, faturalar } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/odemeler", async (req, res) => {
  try {
    const { sirketId, cariId, faturaId, tip } = req.query as Record<string, string>;

    let rows = await db
      .select({
        o: odemeler,
        sirketAd: sirketler.ad,
        cariAd: cariler.ad,
        gemiAd: gemiler.ad,
      })
      .from(odemeler)
      .leftJoin(sirketler, eq(odemeler.sirketId, sirketler.id))
      .leftJoin(cariler, eq(odemeler.cariId, cariler.id))
      .leftJoin(gemiler, eq(odemeler.gemiId, gemiler.id))
      .orderBy(odemeler.tarih);

    if (sirketId) rows = rows.filter(r => r.o.sirketId === Number(sirketId));
    if (cariId) rows = rows.filter(r => r.o.cariId === Number(cariId));
    if (faturaId) rows = rows.filter(r => r.o.faturaId === Number(faturaId));
    if (tip) rows = rows.filter(r => r.o.tip === tip);

    res.json(rows.map(r => formatOdeme(r.o, r.sirketAd, r.cariAd, r.gemiAd, null, null)));
  } catch (err) {
    res.status(500).json({ error: "Ödemeler listelenemedi" });
  }
});

router.post("/odemeler", async (req, res) => {
  try {
    const { sirketId, cariId, gemiId, bankaHesabiId, faturaId, tip, tarih, tutar, paraBirimi, odemeYontemi, aciklama } = req.body;
    if (!sirketId || !cariId || !tip || !tarih || !tutar)
      return res.status(400).json({ error: "Zorunlu alanlar eksik" });

    const [row] = await db.insert(odemeler).values({
      sirketId, cariId, gemiId: gemiId ?? null, bankaHesabiId: bankaHesabiId ?? null,
      faturaId: faturaId ?? null, tip, tarih, tutar: String(tutar),
      paraBirimi: paraBirimi ?? "USD", odemeYontemi: odemeYontemi ?? "banka_havalesi",
      aciklama,
    }).returning();

    if (faturaId) {
      await guncelleFaturaDurum(faturaId);
    }

    res.status(201).json(formatOdeme(row, null, null, null, null, null));
  } catch (err) {
    res.status(500).json({ error: "Ödeme oluşturulamadı" });
  }
});

router.get("/odemeler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ o: odemeler, sirketAd: sirketler.ad, cariAd: cariler.ad, gemiAd: gemiler.ad })
      .from(odemeler)
      .leftJoin(sirketler, eq(odemeler.sirketId, sirketler.id))
      .leftJoin(cariler, eq(odemeler.cariId, cariler.id))
      .leftJoin(gemiler, eq(odemeler.gemiId, gemiler.id))
      .where(eq(odemeler.id, id));
    if (!row) return res.status(404).json({ error: "Ödeme bulunamadı" });
    res.json(formatOdeme(row.o, row.sirketAd, row.cariAd, row.gemiAd, null, null));
  } catch (err) {
    res.status(500).json({ error: "Ödeme getirilemedi" });
  }
});

router.patch("/odemeler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { tarih, tutar, aciklama, odemeYontemi } = req.body;
    const [row] = await db.update(odemeler)
      .set({ tarih, tutar: tutar ? String(tutar) : undefined, aciklama, odemeYontemi })
      .where(eq(odemeler.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Ödeme bulunamadı" });
    if (row.faturaId) await guncelleFaturaDurum(row.faturaId);
    res.json(formatOdeme(row, null, null, null, null, null));
  } catch (err) {
    res.status(500).json({ error: "Ödeme güncellenemedi" });
  }
});

router.delete("/odemeler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db.select().from(odemeler).where(eq(odemeler.id, id));
    await db.delete(odemeler).where(eq(odemeler.id, id));
    if (row?.faturaId) await guncelleFaturaDurum(row.faturaId);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Ödeme silinemedi" });
  }
});

async function guncelleFaturaDurum(faturaId: number) {
  try {
    const [fatura] = await db.select().from(faturalar).where(eq(faturalar.id, faturaId));
    if (!fatura) return;
    const ods = await db.select().from(odemeler).where(eq(odemeler.faturaId, faturaId));
    const odenen = ods.reduce((s, o) => s + Number(o.tutar), 0);
    const genel = Number(fatura.genelToplam);
    let durum: typeof faturalar.$inferSelect["durum"] = "acik";
    if (odenen >= genel) durum = "odendi";
    else if (odenen > 0) durum = "kismi_odendi";
    await db.update(faturalar).set({ durum }).where(eq(faturalar.id, faturaId));
  } catch {}
}

function formatOdeme(
  o: typeof odemeler.$inferSelect,
  sirketAd: string | null | undefined,
  cariAd: string | null | undefined,
  gemiAd: string | null | undefined,
  bankaHesabiAd: string | null | undefined,
  faturaNo: string | null | undefined
) {
  return {
    id: o.id,
    sirketId: o.sirketId, sirketAd: sirketAd ?? null,
    cariId: o.cariId, cariAd: cariAd ?? null,
    gemiId: o.gemiId, gemiAd: gemiAd ?? null,
    bankaHesabiId: o.bankaHesabiId, bankaHesabiAd: bankaHesabiAd ?? null,
    faturaId: o.faturaId, faturaNo: faturaNo ?? null,
    tip: o.tip, tarih: o.tarih,
    tutar: Number(o.tutar), paraBirimi: o.paraBirimi,
    odemeYontemi: o.odemeYontemi,
    aciklama: o.aciklama,
    olusturmaTarihi: o.olusturmaTarihi,
  };
}

export default router;
