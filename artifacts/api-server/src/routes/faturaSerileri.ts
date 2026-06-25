import { Router } from "express";
import { db } from "@workspace/db";
import { faturaSerileri } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele, firmaYazmaDenetimi } from "../middleware/auth";

const router = Router();

router.get("/fatura-serileri", async (req, res) => {
  try {
    const { catiFirmaId } = req.query as Record<string, string>;
    const rows = await db.select().from(faturaSerileri).orderBy(faturaSerileri.ad);
    const { rows: scoped, yetkisiz } = sirketlerFiltrele(rows, req, catiFirmaId);
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    res.json(scoped);
  } catch {
    res.status(500).json({ error: "Fatura serileri listelenemedi" });
  }
});

router.post("/fatura-serileri", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, ad, onek, sonrakiNo, varsayilan } = req.body;
    if (!catiFirmaId || !ad || !onek) { res.status(400).json({ error: "Zorunlu alanlar eksik" }); return; }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    const [row] = await db.insert(faturaSerileri).values({
      catiFirmaId, ad, onek, sonrakiNo: sonrakiNo ?? 1, varsayilan: varsayilan ?? false,
    }).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Fatura serisi oluşturulamadı" });
  }
});

router.patch("/fatura-serileri/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(faturaSerileri).where(eq(faturaSerileri.id, id));
    if (!existing) { res.status(404).json({ error: "Fatura serisi bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const { ad, onek, sonrakiNo, varsayilan } = req.body;
    const [row] = await db.update(faturaSerileri)
      .set({ ad, onek, sonrakiNo, varsayilan })
      .where(eq(faturaSerileri.id, id)).returning();
    res.json(row);
  } catch {
    res.status(500).json({ error: "Fatura serisi güncellenemedi" });
  }
});

router.delete("/fatura-serileri/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(faturaSerileri).where(eq(faturaSerileri.id, id));
    if (!existing) { res.status(404).json({ error: "Fatura serisi bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
    await db.delete(faturaSerileri).where(eq(faturaSerileri.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Fatura serisi silinemedi" });
  }
});

export default router;
