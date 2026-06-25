import { Router } from "express";
import { db } from "@workspace/db";
import { kdvOranlari } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele, firmaYazmaDenetimi } from "../middleware/auth";

const router = Router();

router.get("/kdv-oranlari", async (req, res) => {
  try {
    const { catiFirmaId } = req.query as Record<string, string>;
    const rows = await db.select().from(kdvOranlari).orderBy(kdvOranlari.oran);
    const { rows: scoped, yetkisiz } = sirketlerFiltrele(rows, req, catiFirmaId);
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    res.json(scoped.map(r => ({ ...r, oran: Number(r.oran) })));
  } catch {
    res.status(500).json({ error: "KDV oranları listelenemedi" });
  }
});

router.post("/kdv-oranlari", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, ad, oran, varsayilan } = req.body;
    if (!catiFirmaId || !ad || oran == null) { res.status(400).json({ error: "Zorunlu alanlar eksik" }); return; }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    const [row] = await db.insert(kdvOranlari).values({
      catiFirmaId, ad, oran: String(oran), varsayilan: varsayilan ?? false,
    }).returning();
    res.status(201).json({ ...row, oran: Number(row.oran) });
  } catch {
    res.status(500).json({ error: "KDV oranı oluşturulamadı" });
  }
});

router.patch("/kdv-oranlari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(kdvOranlari).where(eq(kdvOranlari.id, id));
    if (!existing) { res.status(404).json({ error: "KDV oranı bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const { ad, oran, varsayilan } = req.body;
    const [row] = await db.update(kdvOranlari)
      .set({ ad, oran: oran != null ? String(oran) : undefined, varsayilan })
      .where(eq(kdvOranlari.id, id)).returning();
    res.json({ ...row, oran: Number(row.oran) });
  } catch {
    res.status(500).json({ error: "KDV oranı güncellenemedi" });
  }
});

router.delete("/kdv-oranlari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(kdvOranlari).where(eq(kdvOranlari.id, id));
    if (!existing) { res.status(404).json({ error: "KDV oranı bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
    await db.delete(kdvOranlari).where(eq(kdvOranlari.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "KDV oranı silinemedi" });
  }
});

export default router;
