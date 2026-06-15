import { Router } from "express";
import { db } from "@workspace/db";
import { ekipmanlar, gemiler, cariler } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";

const router = Router();

router.get("/ekipmanlar", async (req, res) => {
  try {
    const { sirketId, gemiId } = req.query as Record<string, string>;

    let rows = await db
      .select({ e: ekipmanlar, gemiAd: gemiler.ad })
      .from(ekipmanlar)
      .leftJoin(gemiler, eq(ekipmanlar.gemiId, gemiler.id))
      .orderBy(ekipmanlar.olusturmaTarihi);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, sirketId: r.e.sirketId })), req, sirketId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }
    rows = rows.filter(r => scoped.some(s => s.e.id === r.e.id));

    if (gemiId) rows = rows.filter(r => r.e.gemiId === Number(gemiId));
    res.json(rows.map(r => ({ ...r.e, gemiAd: r.gemiAd ?? null })));
  } catch {
    res.status(500).json({ error: "Ekipmanlar listelenemedi" });
  }
});

router.post("/ekipmanlar", requireYazma, async (req, res) => {
  try {
    const { sirketId, gemiId, tip, seriNo, kurulumTarihi, garantiBitisTarihi, notlar, aktif } = req.body;
    if (!sirketId || !gemiId || !tip || !seriNo) { res.status(400).json({ error: "Zorunlu alanlar eksik" }); return; }
    if (!sirketErisimKontrol(Number(sirketId), req)) { res.status(403).json({ error: "Bu şirkete erişim izniniz yok" }); return; }

    {
      const [gemiCari] = await db.select({ sid: cariler.sirketId }).from(gemiler)
        .innerJoin(cariler, eq(gemiler.cariId, cariler.id))
        .where(eq(gemiler.id, Number(gemiId)));
      if (!gemiCari || gemiCari.sid !== Number(sirketId)) { res.status(400).json({ error: "Belirtilen gemi bu şirkete ait değil" }); return; }
    }

    const [row] = await db.insert(ekipmanlar).values({
      sirketId, gemiId, tip, seriNo, kurulumTarihi, garantiBitisTarihi, notlar, aktif: aktif ?? true,
    }).returning();
    res.status(201).json({ ...row, gemiAd: null });
  } catch {
    res.status(500).json({ error: "Ekipman oluşturulamadı" });
  }
});

router.patch("/ekipmanlar/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(ekipmanlar).where(eq(ekipmanlar.id, id));
    if (!existing) { res.status(404).json({ error: "Ekipman bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const { tip, seriNo, kurulumTarihi, garantiBitisTarihi, notlar, aktif, gemiId } = req.body;
    if (gemiId !== undefined) {
      const [gemiCari] = await db.select({ sid: cariler.sirketId }).from(gemiler)
        .innerJoin(cariler, eq(gemiler.cariId, cariler.id))
        .where(eq(gemiler.id, Number(gemiId)));
      if (!gemiCari || gemiCari.sid !== existing.sirketId) { res.status(400).json({ error: "Belirtilen gemi bu şirkete ait değil" }); return; }
    }
    const [row] = await db.update(ekipmanlar)
      .set({ tip, seriNo, kurulumTarihi, garantiBitisTarihi, notlar, aktif, gemiId })
      .where(eq(ekipmanlar.id, id)).returning();
    res.json({ ...row, gemiAd: null });
  } catch {
    res.status(500).json({ error: "Ekipman güncellenemedi" });
  }
});

router.delete("/ekipmanlar/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(ekipmanlar).where(eq(ekipmanlar.id, id));
    if (!existing) { res.status(404).json({ error: "Ekipman bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.sirketId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    await db.delete(ekipmanlar).where(eq(ekipmanlar.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Ekipman silinemedi" });
  }
});

export default router;
