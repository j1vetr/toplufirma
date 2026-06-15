import { Router } from "express";
import { db } from "@workspace/db";
import { odemeler, sirketler, cariler, gemiler, bankaHesaplari, faturalar } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";

const router = Router();

router.get("/odemeler", async (req, res) => {
  try {
    const { sirketId, cariId, faturaId, tip } = req.query as Record<string, string>;

    let rows = await db
      .select({ o: odemeler, sirketAd: sirketler.ad, cariAd: cariler.ad, gemiAd: gemiler.ad })
      .from(odemeler)
      .leftJoin(sirketler, eq(odemeler.sirketId, sirketler.id))
      .leftJoin(cariler, eq(odemeler.cariId, cariler.id))
      .leftJoin(gemiler, eq(odemeler.gemiId, gemiler.id))
      .orderBy(odemeler.tarih);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, sirketId: r.o.sirketId })), req, sirketId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }
    rows = rows.filter(r => scoped.some(s => s.o.id === r.o.id));

    if (cariId) rows = rows.filter(r => r.o.cariId === Number(cariId));
    if (faturaId) rows = rows.filter(r => r.o.faturaId === Number(faturaId));
    if (tip) rows = rows.filter(r => r.o.tip === tip);

    res.json(rows.map(r => formatOdeme(r.o, r.sirketAd, r.cariAd, r.gemiAd, null, null)));
  } catch {
    res.status(500).json({ error: "Ödemeler listelenemedi" });
  }
});

router.post("/odemeler", requireYazma, async (req, res) => {
  try {
    const { sirketId, cariId, gemiId, bankaHesabiId, faturaId, tip, tarih, tutar, paraBirimi, odemeYontemi, aciklama } = req.body;
    if (!sirketId || !cariId || !tip || !tarih || !tutar) {
      res.status(400).json({ error: "Zorunlu alanlar eksik" }); return;
    }
    if (!sirketErisimKontrol(Number(sirketId), req)) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }

    if (cariId) {
      const [cari] = await db.select({ sid: cariler.sirketId }).from(cariler).where(eq(cariler.id, Number(cariId)));
      if (!cari || cari.sid !== Number(sirketId)) { res.status(400).json({ error: "Belirtilen cari bu şirkete ait değil" }); return; }
    }
    if (faturaId) {
      const [fat] = await db.select({ sid: faturalar.sirketId }).from(faturalar).where(eq(faturalar.id, Number(faturaId)));
      if (!fat || fat.sid !== Number(sirketId)) { res.status(400).json({ error: "Belirtilen fatura bu şirkete ait değil" }); return; }
    }
    if (bankaHesabiId) {
      const [bh] = await db.select({ sid: bankaHesaplari.sirketId }).from(bankaHesaplari).where(eq(bankaHesaplari.id, Number(bankaHesabiId)));
      if (!bh || bh.sid !== Number(sirketId)) { res.status(400).json({ error: "Belirtilen banka hesabı bu şirkete ait değil" }); return; }
    }
    if (gemiId) {
      const [gemiCari] = await db.select({ sid: cariler.sirketId }).from(gemiler)
        .innerJoin(cariler, eq(gemiler.cariId, cariler.id))
        .where(eq(gemiler.id, Number(gemiId)));
      if (!gemiCari || gemiCari.sid !== Number(sirketId)) { res.status(400).json({ error: "Belirtilen gemi bu şirkete ait değil" }); return; }
    }

    const [row] = await db.insert(odemeler).values({
      sirketId, cariId, gemiId: gemiId ?? null, bankaHesabiId: bankaHesabiId ?? null,
      faturaId: faturaId ?? null, tip, tarih, tutar: String(tutar),
      paraBirimi: paraBirimi ?? "USD", odemeYontemi: odemeYontemi ?? "banka_havalesi", aciklama,
    }).returning();

    if (faturaId) await guncelleFaturaDurum(faturaId);
    res.status(201).json(formatOdeme(row, null, null, null, null, null));
  } catch {
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
    if (!row) { res.status(404).json({ error: "Ödeme bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.o.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    res.json(formatOdeme(row.o, row.sirketAd, row.cariAd, row.gemiAd, null, null));
  } catch {
    res.status(500).json({ error: "Ödeme getirilemedi" });
  }
});

router.patch("/odemeler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(odemeler).where(eq(odemeler.id, id));
    if (!existing) { res.status(404).json({ error: "Ödeme bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const { tarih, tutar, aciklama, odemeYontemi } = req.body;
    const [row] = await db.update(odemeler)
      .set({ tarih, tutar: tutar ? String(tutar) : undefined, aciklama, odemeYontemi })
      .where(eq(odemeler.id, id)).returning();
    if (row.faturaId) await guncelleFaturaDurum(row.faturaId);
    res.json(formatOdeme(row, null, null, null, null, null));
  } catch {
    res.status(500).json({ error: "Ödeme güncellenemedi" });
  }
});

router.delete("/odemeler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(odemeler).where(eq(odemeler.id, id));
    if (!existing) { res.status(404).json({ error: "Ödeme bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    await db.delete(odemeler).where(eq(odemeler.id, id));
    if (existing.faturaId) await guncelleFaturaDurum(existing.faturaId);
    res.status(204).send();
  } catch {
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
  sirketAd: string | null | undefined, cariAd: string | null | undefined,
  gemiAd: string | null | undefined, bankaHesabiAd: string | null | undefined,
  faturaNo: string | null | undefined
) {
  return {
    id: o.id, sirketId: o.sirketId, sirketAd: sirketAd ?? null,
    cariId: o.cariId, cariAd: cariAd ?? null, gemiId: o.gemiId, gemiAd: gemiAd ?? null,
    bankaHesabiId: o.bankaHesabiId, bankaHesabiAd: bankaHesabiAd ?? null,
    faturaId: o.faturaId, faturaNo: faturaNo ?? null, tip: o.tip, tarih: o.tarih,
    tutar: Number(o.tutar), paraBirimi: o.paraBirimi, odemeYontemi: o.odemeYontemi,
    aciklama: o.aciklama, olusturmaTarihi: o.olusturmaTarihi,
  };
}

export default router;
