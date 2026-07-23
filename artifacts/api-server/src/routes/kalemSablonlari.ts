import { Router } from "express";
import { db } from "@workspace/db";
import { kalemSablonlari, firmalar } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele, firmaYazmaDenetimi } from "../middleware/auth";

const router = Router();

function fmt(r: typeof kalemSablonlari.$inferSelect) {
  return {
    ...r,
    birimFiyat: r.birimFiyat != null ? Number(r.birimFiyat) : null,
    kdvOrani: r.kdvOrani != null ? Number(r.kdvOrani) : null,
  };
}

router.get("/kalem-sablonlari", async (req, res) => {
  try {
    const { catiFirmaId, includeInactive } = req.query as Record<string, string>;
    const showAll = includeInactive === "true";
    const rows = await db.select().from(kalemSablonlari)
      .where(showAll ? undefined : eq(kalemSablonlari.aktif, true))
      .orderBy(kalemSablonlari.ad);
    const { rows: scoped, yetkisiz } = sirketlerFiltrele(rows, req, catiFirmaId);
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    res.json(scoped.map(fmt));
  } catch {
    res.status(500).json({ error: "Kalem şablonları listelenemedi" });
  }
});

router.post("/kalem-sablonlari", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, ad, birim, birimFiyat, kdvOrani, paraBirimi } = req.body;
    if (!catiFirmaId || !ad) { res.status(400).json({ error: "Zorunlu alanlar eksik" }); return; }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    const [firma] = await db.select({ id: firmalar.id }).from(firmalar).where(eq(firmalar.id, Number(catiFirmaId)));
    if (!firma) { res.status(400).json({ error: "Firma bulunamadı" }); return; }
    const [row] = await db.insert(kalemSablonlari).values({
      catiFirmaId: Number(catiFirmaId),
      ad,
      birim: birim ?? "Pcs",
      birimFiyat: birimFiyat != null ? String(birimFiyat) : null,
      kdvOrani: kdvOrani != null ? String(kdvOrani) : null,
      paraBirimi: paraBirimi ?? "USD",
      aktif: true,
    }).returning();
    res.status(201).json(fmt(row));
  } catch {
    res.status(500).json({ error: "Kalem şablonu oluşturulamadı" });
  }
});

router.patch("/kalem-sablonlari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(kalemSablonlari).where(eq(kalemSablonlari.id, id));
    if (!existing) { res.status(404).json({ error: "Kalem şablonu bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
    const { ad, birim, birimFiyat, kdvOrani, paraBirimi, aktif } = req.body;
    const [row] = await db.update(kalemSablonlari).set({
      ...(ad != null && { ad }),
      ...(birim != null && { birim }),
      birimFiyat: birimFiyat !== undefined ? (birimFiyat != null ? String(birimFiyat) : null) : existing.birimFiyat,
      kdvOrani: kdvOrani !== undefined ? (kdvOrani != null ? String(kdvOrani) : null) : existing.kdvOrani,
      ...(paraBirimi != null && { paraBirimi }),
      ...(aktif != null && { aktif }),
    }).where(eq(kalemSablonlari.id, id)).returning();
    res.json(fmt(row));
  } catch {
    res.status(500).json({ error: "Kalem şablonu güncellenemedi" });
  }
});

router.delete("/kalem-sablonlari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(kalemSablonlari).where(eq(kalemSablonlari.id, id));
    if (!existing) { res.status(404).json({ error: "Kalem şablonu bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
    await db.delete(kalemSablonlari).where(eq(kalemSablonlari.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Kalem şablonu silinemedi" });
  }
});

export default router;
