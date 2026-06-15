import { Router } from "express";
import { db } from "@workspace/db";
import { kdvOranlari } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/kdv-oranlari", async (req, res) => {
  try {
    const { sirketId } = req.query as Record<string, string>;
    let rows = await db.select().from(kdvOranlari).orderBy(kdvOranlari.oran);
    if (sirketId) rows = rows.filter(r => r.sirketId === Number(sirketId));
    res.json(rows.map(r => ({ ...r, oran: Number(r.oran) })));
  } catch (err) {
    res.status(500).json({ error: "KDV oranları listelenemedi" });
  }
});

router.post("/kdv-oranlari", async (req, res) => {
  try {
    const { sirketId, ad, oran, varsayilan } = req.body;
    if (!sirketId || !ad || oran == null) return res.status(400).json({ error: "Zorunlu alanlar eksik" });
    const [row] = await db.insert(kdvOranlari).values({
      sirketId, ad, oran: String(oran), varsayilan: varsayilan ?? false,
    }).returning();
    res.status(201).json({ ...row, oran: Number(row.oran) });
  } catch (err) {
    res.status(500).json({ error: "KDV oranı oluşturulamadı" });
  }
});

router.patch("/kdv-oranlari/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { ad, oran, varsayilan } = req.body;
    const [row] = await db.update(kdvOranlari)
      .set({ ad, oran: oran != null ? String(oran) : undefined, varsayilan })
      .where(eq(kdvOranlari.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "KDV oranı bulunamadı" });
    res.json({ ...row, oran: Number(row.oran) });
  } catch (err) {
    res.status(500).json({ error: "KDV oranı güncellenemedi" });
  }
});

router.delete("/kdv-oranlari/:id", async (req, res) => {
  try {
    await db.delete(kdvOranlari).where(eq(kdvOranlari.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "KDV oranı silinemedi" });
  }
});

export default router;
