import { Router } from "express";
import { db } from "@workspace/db";
import { faturaSerileri } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/fatura-serileri", async (req, res) => {
  try {
    const { sirketId } = req.query as Record<string, string>;
    let rows = await db.select().from(faturaSerileri).orderBy(faturaSerileri.ad);
    if (sirketId) rows = rows.filter(r => r.sirketId === Number(sirketId));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Fatura serileri listelenemedi" });
  }
});

router.post("/fatura-serileri", async (req, res) => {
  try {
    const { sirketId, ad, onek, sonrakiNo, varsayilan } = req.body;
    if (!sirketId || !ad || !onek) return res.status(400).json({ error: "Zorunlu alanlar eksik" });
    const [row] = await db.insert(faturaSerileri).values({
      sirketId, ad, onek, sonrakiNo: sonrakiNo ?? 1, varsayilan: varsayilan ?? false,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Fatura serisi oluşturulamadı" });
  }
});

router.patch("/fatura-serileri/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { ad, onek, sonrakiNo, varsayilan } = req.body;
    const [row] = await db.update(faturaSerileri)
      .set({ ad, onek, sonrakiNo, varsayilan })
      .where(eq(faturaSerileri.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Fatura serisi bulunamadı" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Fatura serisi güncellenemedi" });
  }
});

router.delete("/fatura-serileri/:id", async (req, res) => {
  try {
    await db.delete(faturaSerileri).where(eq(faturaSerileri.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Fatura serisi silinemedi" });
  }
});

export default router;
