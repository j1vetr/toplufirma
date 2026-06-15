import { Router } from "express";
import { db } from "@workspace/db";
import { sirketler } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireYonetici, sirketErisimKontrol, requireYazma } from "../middleware/auth";

const router = Router();

router.get("/sirketler", async (req, res) => {
  try {
    const rows = await db.select().from(sirketler).orderBy(sirketler.ad);
    if (req.kullanici?.rol === "yonetici") {
      return res.json(rows.map(formatSirket));
    }
    const izinli = req.izinliSirketler ?? [];
    return res.json(rows.filter(r => izinli.includes(r.id)).map(formatSirket));
  } catch {
    res.status(500).json({ error: "Şirketler listelenemedi" });
  }
});

router.post("/sirketler", requireYonetici, requireYazma, async (req, res) => {
  try {
    const { ad, vergiNo, vergiDairesi, adres, telefon, eposta, seriOneki, aktif } = req.body;
    if (!ad || !seriOneki) return res.status(400).json({ error: "ad ve seriOneki zorunludur" });
    const [row] = await db.insert(sirketler).values({
      ad, vergiNo, vergiDairesi, adres, telefon, eposta,
      seriOneki, aktif: aktif ?? true,
    }).returning();
    res.status(201).json(formatSirket(row));
  } catch {
    res.status(500).json({ error: "Şirket oluşturulamadı" });
  }
});

router.get("/sirketler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!sirketErisimKontrol(id, req)) return res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
    const [row] = await db.select().from(sirketler).where(eq(sirketler.id, id));
    if (!row) return res.status(404).json({ error: "Şirket bulunamadı" });
    res.json(formatSirket(row));
  } catch {
    res.status(500).json({ error: "Şirket getirilemedi" });
  }
});

router.patch("/sirketler/:id", requireYonetici, requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { ad, vergiNo, vergiDairesi, adres, telefon, eposta, seriOneki, aktif } = req.body;
    const [row] = await db.update(sirketler)
      .set({ ad, vergiNo, vergiDairesi, adres, telefon, eposta, seriOneki, aktif })
      .where(eq(sirketler.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Şirket bulunamadı" });
    res.json(formatSirket(row));
  } catch {
    res.status(500).json({ error: "Şirket güncellenemedi" });
  }
});

router.delete("/sirketler/:id", requireYonetici, requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(sirketler).where(eq(sirketler.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Şirket silinemedi" });
  }
});

function formatSirket(r: typeof sirketler.$inferSelect) {
  return {
    id: r.id, ad: r.ad, vergiNo: r.vergiNo, vergiDairesi: r.vergiDairesi,
    adres: r.adres, telefon: r.telefon, eposta: r.eposta,
    seriOneki: r.seriOneki, logo: r.logo, aktif: r.aktif,
    olusturmaTarihi: r.olusturmaTarihi,
  };
}

export default router;
