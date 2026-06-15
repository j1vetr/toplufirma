import { Router } from "express";
import { db } from "@workspace/db";
import { cariler, sirketler, gemiler, faturalar, odemeler } from "@workspace/db";
import { eq, and, sql, or } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";

const router = Router();

router.get("/cariler", async (req, res) => {
  try {
    const { sirketId, tip, arama } = req.query as Record<string, string>;

    const conditions: ReturnType<typeof eq>[] = [];
    if (tip) conditions.push(eq(cariler.tip, tip as typeof cariler.tip.enumValues[number]));

    let rows = await db
      .select({ c: cariler, sirketAd: sirketler.ad })
      .from(cariler)
      .leftJoin(sirketler, eq(cariler.sirketId, sirketler.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(cariler.ad);

    const { rows: filtered, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, sirketId: r.c.sirketId })),
      req, sirketId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }

    let result = rows.filter(r => filtered.some(f => f.c.id === r.c.id));
    if (arama) {
      const q = arama.toLowerCase();
      result = result.filter(r =>
        r.c.ad.toLowerCase().includes(q) ||
        (r.c.vergiNo ?? "").toLowerCase().includes(q) ||
        (r.c.eposta ?? "").toLowerCase().includes(q)
      );
    }

    const bakiyeler = await getBakiyeler();
    res.json(result.map(r => formatCari(r.c, r.sirketAd, bakiyeler[r.c.id])));
  } catch {
    res.status(500).json({ error: "Cariler listelenemedi" });
  }
});

router.post("/cariler", requireYazma, async (req, res) => {
  try {
    const { sirketId, ad, tip, vergiNo, vergiDairesi, telefon, eposta, adres, yetkiliKisi, paraBirimi, notlar, aktif } = req.body;
    if (!sirketId || !ad || !tip) { res.status(400).json({ error: "sirketId, ad ve tip zorunludur" }); return; }
    if (!sirketErisimKontrol(Number(sirketId), req)) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }

    const [row] = await db.insert(cariler).values({
      sirketId, ad, tip, vergiNo, vergiDairesi, telefon, eposta,
      adres, yetkiliKisi, paraBirimi: paraBirimi ?? "USD",
      notlar, aktif: aktif ?? true,
    }).returning();
    const bakiyeler = await getBakiyeler();
    res.status(201).json(formatCari(row, null, bakiyeler[row.id]));
  } catch {
    res.status(500).json({ error: "Cari oluşturulamadı" });
  }
});

router.get("/cariler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ c: cariler, sirketAd: sirketler.ad })
      .from(cariler)
      .leftJoin(sirketler, eq(cariler.sirketId, sirketler.id))
      .where(eq(cariler.id, id));
    if (!row) { res.status(404).json({ error: "Cari bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.c.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const bakiyeler = await getBakiyeler();
    const bagliGemiler = await db.select().from(gemiler).where(eq(gemiler.cariId, id));
    const acikFaturalar = await db.select().from(faturalar)
      .where(and(eq(faturalar.cariId, id), eq(faturalar.durum, "acik")));

    res.json({
      ...formatCari(row.c, row.sirketAd, bakiyeler[id]),
      acikFaturalar: acikFaturalar.map(f => formatFaturaBasic(f)),
      bagliGemiler: bagliGemiler.map(g => ({
        id: g.id, cariId: g.cariId, ad: g.ad,
        imoNumarasi: g.imoNumarasi, bayrakDevleti: g.bayrakDevleti,
        aktif: g.aktif, olusturmaTarihi: g.olusturmaTarihi,
      })),
      sonIslemler: [],
    });
  } catch {
    res.status(500).json({ error: "Cari getirilemedi" });
  }
});

router.patch("/cariler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(cariler).where(eq(cariler.id, id));
    if (!existing) { res.status(404).json({ error: "Cari bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const { ad, tip, vergiNo, vergiDairesi, telefon, eposta, adres, yetkiliKisi, paraBirimi, notlar, aktif } = req.body;
    const [row] = await db.update(cariler)
      .set({ ad, tip, vergiNo, vergiDairesi, telefon, eposta, adres, yetkiliKisi, paraBirimi, notlar, aktif })
      .where(eq(cariler.id, id))
      .returning();
    const bakiyeler = await getBakiyeler();
    res.json(formatCari(row, null, bakiyeler[row.id]));
  } catch {
    res.status(500).json({ error: "Cari güncellenemedi" });
  }
});

router.delete("/cariler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(cariler).where(eq(cariler.id, id));
    if (!existing) { res.status(404).json({ error: "Cari bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    await db.delete(cariler).where(eq(cariler.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Cari silinemedi" });
  }
});

router.get("/cariler/:id/ekstre", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [cari] = await db.select().from(cariler).where(eq(cariler.id, id));
    if (!cari) { res.status(404).json({ error: "Cari bulunamadı" }); return; }
    if (!sirketErisimKontrol(cari.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const fats = await db.select().from(faturalar).where(eq(faturalar.cariId, id)).orderBy(faturalar.faturaTarihi);
    const ods = await db.select().from(odemeler).where(eq(odemeler.cariId, id)).orderBy(odemeler.tarih);

    const kalemler: Record<string, unknown>[] = [];
    for (const f of fats) {
      kalemler.push({
        id: f.id, tip: "fatura", tarih: f.faturaTarihi,
        aciklama: f.aciklama ?? `Fatura ${f.faturaNo}`, referansNo: f.faturaNo,
        borc: Number(f.genelToplam), alacak: null, tutar: Number(f.genelToplam),
        paraBirimi: f.paraBirimi, bakiye: 0,
      });
    }
    for (const o of ods) {
      kalemler.push({
        id: o.id, tip: o.tip, tarih: o.tarih, aciklama: o.aciklama, referansNo: null,
        borc: o.tip === "odeme" ? Number(o.tutar) : null,
        alacak: o.tip === "tahsilat" ? Number(o.tutar) : null,
        tutar: Number(o.tutar), paraBirimi: o.paraBirimi, bakiye: 0,
      });
    }
    kalemler.sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)));

    let bakiye = 0, toplamBorc = 0, toplamAlacak = 0;
    for (const k of kalemler) {
      if (k.borc) { bakiye += k.borc as number; toplamBorc += k.borc as number; }
      if (k.alacak) { bakiye -= k.alacak as number; toplamAlacak += k.alacak as number; }
      k.bakiye = bakiye;
    }

    res.json({ cariId: id, cariAd: cari.ad, kalemler, toplamBorc, toplamAlacak, kalanBakiye: bakiye });
  } catch {
    res.status(500).json({ error: "Ekstre getirilemedi" });
  }
});

async function getBakiyeler(): Promise<Record<number, { toplamBorc: number; toplamAlacak: number; kalanBakiye: number }>> {
  const fatRows = await db
    .select({ cariId: faturalar.cariId, genel: sql<string>`sum(${faturalar.genelToplam})` })
    .from(faturalar)
    .where(or(eq(faturalar.durum, "acik"), eq(faturalar.durum, "kismi_odendi")))
    .groupBy(faturalar.cariId);
  const odRows = await db
    .select({ cariId: odemeler.cariId, tip: odemeler.tip, toplam: sql<string>`sum(${odemeler.tutar})` })
    .from(odemeler)
    .groupBy(odemeler.cariId, odemeler.tip);
  const result: Record<number, { toplamBorc: number; toplamAlacak: number; kalanBakiye: number }> = {};
  for (const r of fatRows) {
    if (!result[r.cariId]) result[r.cariId] = { toplamBorc: 0, toplamAlacak: 0, kalanBakiye: 0 };
    result[r.cariId].toplamBorc = Number(r.genel ?? 0);
  }
  for (const r of odRows) {
    if (!result[r.cariId]) result[r.cariId] = { toplamBorc: 0, toplamAlacak: 0, kalanBakiye: 0 };
    if (r.tip === "tahsilat") result[r.cariId].toplamAlacak = Number(r.toplam ?? 0);
  }
  for (const id of Object.keys(result)) {
    const b = result[Number(id)];
    b.kalanBakiye = b.toplamBorc - b.toplamAlacak;
  }
  return result;
}

function formatCari(
  r: typeof cariler.$inferSelect,
  sirketAd: string | null | undefined,
  bakiye?: { toplamBorc: number; toplamAlacak: number; kalanBakiye: number }
) {
  return {
    id: r.id, sirketId: r.sirketId, sirketAd: sirketAd ?? null,
    ad: r.ad, tip: r.tip, vergiNo: r.vergiNo, vergiDairesi: r.vergiDairesi,
    telefon: r.telefon, eposta: r.eposta, adres: r.adres,
    yetkiliKisi: r.yetkiliKisi, paraBirimi: r.paraBirimi, notlar: r.notlar, aktif: r.aktif,
    toplamBorc: bakiye?.toplamBorc ?? 0, toplamAlacak: bakiye?.toplamAlacak ?? 0,
    kalanBakiye: bakiye?.kalanBakiye ?? 0, olusturmaTarihi: r.olusturmaTarihi,
  };
}

function formatFaturaBasic(f: typeof faturalar.$inferSelect) {
  return {
    id: f.id, sirketId: f.sirketId, sirketAd: null, cariId: f.cariId, cariAd: null,
    gemiId: f.gemiId, gemiAd: null, faturaNo: f.faturaNo,
    faturaTarihi: f.faturaTarihi, vadeTarihi: f.vadeTarihi,
    paraBirimi: f.paraBirimi, durum: f.durum,
    toplamTutar: Number(f.toplamTutar), kdvTutari: Number(f.kdvTutari),
    genelToplam: Number(f.genelToplam), odenenTutar: 0, kalanTutar: Number(f.genelToplam),
    notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
  };
}

export default router;
