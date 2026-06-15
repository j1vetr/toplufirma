import { Router } from "express";
import { db } from "@workspace/db";
import { starlinkPlanlari, sirketler, cariler, gemiler } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";

const router = Router();

router.get("/starlink-planlari", async (req, res) => {
  try {
    const { sirketId, gemiId, aktif } = req.query as Record<string, string>;

    let rows = await db
      .select({ p: starlinkPlanlari, sirketAd: sirketler.ad, cariAd: cariler.ad, gemiAd: gemiler.ad })
      .from(starlinkPlanlari)
      .leftJoin(sirketler, eq(starlinkPlanlari.sirketId, sirketler.id))
      .leftJoin(cariler, eq(starlinkPlanlari.cariId, cariler.id))
      .leftJoin(gemiler, eq(starlinkPlanlari.gemiId, gemiler.id))
      .orderBy(starlinkPlanlari.baslangicTarihi);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, sirketId: r.p.sirketId })), req, sirketId
    );
    if (yetkisiz) return res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
    rows = rows.filter(r => scoped.some(s => s.p.id === r.p.id));

    if (gemiId) rows = rows.filter(r => r.p.gemiId === Number(gemiId));
    if (aktif !== undefined) rows = rows.filter(r => r.p.aktif === (aktif === "true"));

    res.json(rows.map(r => formatPlan(r.p, r.sirketAd, r.cariAd, r.gemiAd)));
  } catch {
    res.status(500).json({ error: "Starlink planları listelenemedi" });
  }
});

router.post("/starlink-planlari", requireYazma, async (req, res) => {
  try {
    const { sirketId, cariId, gemiId, planAdi, hizMbps, baslangicTarihi, bitisTarihi, aylikUcret, paraBirimi, otomatikYenileme, aktif, notlar } = req.body;
    if (!sirketId || !cariId || !gemiId || !planAdi || !baslangicTarihi || !bitisTarihi || !aylikUcret)
      return res.status(400).json({ error: "Zorunlu alanlar eksik" });
    if (!sirketErisimKontrol(Number(sirketId), req)) return res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });

    const [row] = await db.insert(starlinkPlanlari).values({
      sirketId, cariId, gemiId, planAdi, hizMbps,
      baslangicTarihi, bitisTarihi, aylikUcret: String(aylikUcret),
      paraBirimi: paraBirimi ?? "USD", otomatikYenileme: otomatikYenileme ?? true,
      aktif: aktif ?? true, notlar,
    }).returning();
    res.status(201).json(formatPlan(row, null, null, null));
  } catch {
    res.status(500).json({ error: "Starlink planı oluşturulamadı" });
  }
});

router.get("/starlink-planlari/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ p: starlinkPlanlari, sirketAd: sirketler.ad, cariAd: cariler.ad, gemiAd: gemiler.ad })
      .from(starlinkPlanlari)
      .leftJoin(sirketler, eq(starlinkPlanlari.sirketId, sirketler.id))
      .leftJoin(cariler, eq(starlinkPlanlari.cariId, cariler.id))
      .leftJoin(gemiler, eq(starlinkPlanlari.gemiId, gemiler.id))
      .where(eq(starlinkPlanlari.id, id));
    if (!row) return res.status(404).json({ error: "Plan bulunamadı" });
    if (!sirketErisimKontrol(row.p.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });
    res.json(formatPlan(row.p, row.sirketAd, row.cariAd, row.gemiAd));
  } catch {
    res.status(500).json({ error: "Plan getirilemedi" });
  }
});

router.patch("/starlink-planlari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(starlinkPlanlari).where(eq(starlinkPlanlari.id, id));
    if (!existing) return res.status(404).json({ error: "Plan bulunamadı" });
    if (!sirketErisimKontrol(existing.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });

    const { planAdi, hizMbps, bitisTarihi, aylikUcret, otomatikYenileme, aktif, notlar } = req.body;
    const [row] = await db.update(starlinkPlanlari)
      .set({ planAdi, hizMbps, bitisTarihi, aylikUcret: aylikUcret ? String(aylikUcret) : undefined, otomatikYenileme, aktif, notlar })
      .where(eq(starlinkPlanlari.id, id)).returning();
    res.json(formatPlan(row, null, null, null));
  } catch {
    res.status(500).json({ error: "Plan güncellenemedi" });
  }
});

router.delete("/starlink-planlari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(starlinkPlanlari).where(eq(starlinkPlanlari.id, id));
    if (!existing) return res.status(404).json({ error: "Plan bulunamadı" });
    if (!sirketErisimKontrol(existing.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });
    await db.delete(starlinkPlanlari).where(eq(starlinkPlanlari.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Plan silinemedi" });
  }
});

function formatPlan(
  p: typeof starlinkPlanlari.$inferSelect,
  sirketAd: string | null | undefined, cariAd: string | null | undefined, gemiAd: string | null | undefined
) {
  const kalanGun = Math.ceil((new Date(p.bitisTarihi).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return {
    id: p.id, sirketId: p.sirketId, sirketAd: sirketAd ?? null,
    cariId: p.cariId, cariAd: cariAd ?? null, gemiId: p.gemiId, gemiAd: gemiAd ?? null,
    planAdi: p.planAdi, hizMbps: p.hizMbps,
    baslangicTarihi: p.baslangicTarihi, bitisTarihi: p.bitisTarihi,
    aylikUcret: Number(p.aylikUcret), paraBirimi: p.paraBirimi,
    otomatikYenileme: p.otomatikYenileme, aktif: p.aktif,
    notlar: p.notlar, kalanGun, olusturmaTarihi: p.olusturmaTarihi,
  };
}

export default router;
