import { Router } from "express";
import { db } from "@workspace/db";
import { odemeler, firmalar, gemiler, bankaHesaplari, faturalar } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele, firmaYazmaDenetimi } from "../middleware/auth";

const router = Router();

router.get("/odemeler", async (req, res) => {
  try {
    const { catiFirmaId, bagliFirmaId, faturaId, tip } = req.query as Record<string, string>;

    let rows = await db
      .select({ o: odemeler, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad })
      .from(odemeler)
      .leftJoin(firmalar, eq(odemeler.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(odemeler.gemiId, gemiler.id))
      .orderBy(odemeler.tarih);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, catiFirmaId: r.o.catiFirmaId })), req, catiFirmaId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    rows = rows.filter(r => scoped.some(s => s.o.id === r.o.id));

    if (bagliFirmaId) rows = rows.filter(r => r.o.bagliFirmaId === Number(bagliFirmaId));
    if (faturaId) rows = rows.filter(r => r.o.faturaId === Number(faturaId));
    if (tip) rows = rows.filter(r => r.o.tip === tip);

    res.json(rows.map(r => formatOdeme(r.o, r.catiFirmaAd, r.gemiAd, null, null)));
  } catch {
    res.status(500).json({ error: "Ödemeler listelenemedi" });
  }
});

router.post("/odemeler", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, bagliFirmaId, gemiId, bankaHesabiId, faturaId, tip, tarih, tutar, paraBirimi, odemeYontemi, aciklama } = req.body;
    if (!catiFirmaId || !tip || !tarih || !tutar) {
      res.status(400).json({ error: "Zorunlu alanlar eksik" }); return;
    }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    if (bagliFirmaId) {
      const [bf] = await db.select({ uid: firmalar.ustFirmaId }).from(firmalar).where(eq(firmalar.id, Number(bagliFirmaId)));
      if (!bf || bf.uid !== Number(catiFirmaId)) { res.status(400).json({ error: "Belirtilen bağlı firma bu çatı firmaya ait değil" }); return; }
    }
    if (faturaId) {
      const [fat] = await db.select({ cid: faturalar.catiFirmaId }).from(faturalar).where(eq(faturalar.id, Number(faturaId)));
      if (!fat || fat.cid !== Number(catiFirmaId)) { res.status(400).json({ error: "Belirtilen fatura bu firmaya ait değil" }); return; }
    }
    if (bankaHesabiId) {
      const [bh] = await db.select({ cid: bankaHesaplari.catiFirmaId }).from(bankaHesaplari).where(eq(bankaHesaplari.id, Number(bankaHesabiId)));
      if (!bh || bh.cid !== Number(catiFirmaId)) { res.status(400).json({ error: "Belirtilen banka hesabı bu firmaya ait değil" }); return; }
    }

    const [row] = await db.insert(odemeler).values({
      catiFirmaId, bagliFirmaId: bagliFirmaId ?? null, gemiId: gemiId ?? null,
      bankaHesabiId: bankaHesabiId ?? null,
      faturaId: faturaId ?? null, tip, tarih, tutar: String(tutar),
      paraBirimi: paraBirimi ?? "USD", odemeYontemi: odemeYontemi ?? "banka_havalesi", aciklama,
    }).returning();

    if (faturaId) await guncelleFaturaDurum(faturaId);
    res.status(201).json(formatOdeme(row, null, null, null, null));
  } catch {
    res.status(500).json({ error: "Ödeme oluşturulamadı" });
  }
});

router.get("/odemeler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ o: odemeler, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad })
      .from(odemeler)
      .leftJoin(firmalar, eq(odemeler.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(odemeler.gemiId, gemiler.id))
      .where(eq(odemeler.id, id));
    if (!row) { res.status(404).json({ error: "Ödeme bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.o.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    res.json(formatOdeme(row.o, row.catiFirmaAd, row.gemiAd, null, null));
  } catch {
    res.status(500).json({ error: "Ödeme getirilemedi" });
  }
});

router.patch("/odemeler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(odemeler).where(eq(odemeler.id, id));
    if (!existing) { res.status(404).json({ error: "Ödeme bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const { tarih, tutar, aciklama, odemeYontemi } = req.body;
    const [row] = await db.update(odemeler)
      .set({ tarih, tutar: tutar ? String(tutar) : undefined, aciklama, odemeYontemi })
      .where(eq(odemeler.id, id)).returning();
    if (row.faturaId) await guncelleFaturaDurum(row.faturaId);
    res.json(formatOdeme(row, null, null, null, null));
  } catch {
    res.status(500).json({ error: "Ödeme güncellenemedi" });
  }
});

router.delete("/odemeler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(odemeler).where(eq(odemeler.id, id));
    if (!existing) { res.status(404).json({ error: "Ödeme bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
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
    const odenen = ods.filter(o => o.tip === "tahsilat").reduce((s, o) => s + Number(o.tutar), 0);
    const genel = Number(fatura.genelToplam);
    let durum: typeof faturalar.$inferSelect["durum"] = "acik";
    if (odenen >= genel) durum = "odendi";
    else if (odenen > 0) durum = "kismi_odendi";
    await db.update(faturalar).set({ durum }).where(eq(faturalar.id, faturaId));
  } catch {}
}

function formatOdeme(
  o: typeof odemeler.$inferSelect,
  catiFirmaAd: string | null | undefined,
  gemiAd: string | null | undefined,
  bankaHesabiAd: string | null | undefined,
  faturaNo: string | null | undefined
) {
  return {
    id: o.id, catiFirmaId: o.catiFirmaId, catiFirmaAd: catiFirmaAd ?? null,
    bagliFirmaId: o.bagliFirmaId, gemiId: o.gemiId, gemiAd: gemiAd ?? null,
    bankaHesabiId: o.bankaHesabiId, bankaHesabiAd: bankaHesabiAd ?? null,
    faturaId: o.faturaId, faturaNo: faturaNo ?? null, tip: o.tip, tarih: o.tarih,
    tutar: Number(o.tutar), paraBirimi: o.paraBirimi, odemeYontemi: o.odemeYontemi,
    aciklama: o.aciklama, olusturmaTarihi: o.olusturmaTarihi,
  };
}

export default router;
