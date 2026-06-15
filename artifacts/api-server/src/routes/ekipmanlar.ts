import { Router } from "express";
import { db } from "@workspace/db";
import { ekipmanlar, gemiler } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/ekipmanlar", async (req, res) => {
  try {
    const { sirketId, gemiId } = req.query as Record<string, string>;

    let rows = await db
      .select({ e: ekipmanlar, gemiAd: gemiler.ad })
      .from(ekipmanlar)
      .leftJoin(gemiler, eq(ekipmanlar.gemiId, gemiler.id))
      .orderBy(ekipmanlar.olusturmaTarihi);

    if (sirketId) rows = rows.filter(r => r.e.sirketId === Number(sirketId));
    if (gemiId) rows = rows.filter(r => r.e.gemiId === Number(gemiId));

    res.json(rows.map(r => ({ ...r.e, gemiAd: r.gemiAd ?? null })));
  } catch (err) {
    res.status(500).json({ error: "Ekipmanlar listelenemedi" });
  }
});

router.post("/ekipmanlar", async (req, res) => {
  try {
    const { sirketId, gemiId, tip, seriNo, kurulumTarihi, garantiBitisTarihi, notlar, aktif } = req.body;
    if (!sirketId || !gemiId || !tip || !seriNo)
      return res.status(400).json({ error: "Zorunlu alanlar eksik" });
    const [row] = await db.insert(ekipmanlar).values({
      sirketId, gemiId, tip, seriNo, kurulumTarihi, garantiBitisTarihi, notlar, aktif: aktif ?? true,
    }).returning();
    res.status(201).json({ ...row, gemiAd: null });
  } catch (err) {
    res.status(500).json({ error: "Ekipman oluşturulamadı" });
  }
});

router.patch("/ekipmanlar/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { tip, seriNo, kurulumTarihi, garantiBitisTarihi, notlar, aktif, gemiId } = req.body;
    const [row] = await db.update(ekipmanlar)
      .set({ tip, seriNo, kurulumTarihi, garantiBitisTarihi, notlar, aktif, gemiId })
      .where(eq(ekipmanlar.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Ekipman bulunamadı" });
    res.json({ ...row, gemiAd: null });
  } catch (err) {
    res.status(500).json({ error: "Ekipman güncellenemedi" });
  }
});

router.delete("/ekipmanlar/:id", async (req, res) => {
  try {
    await db.delete(ekipmanlar).where(eq(ekipmanlar.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Ekipman silinemedi" });
  }
});

export default router;
