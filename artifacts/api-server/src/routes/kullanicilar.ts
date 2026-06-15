import { Router } from "express";
import { db } from "@workspace/db";
import { kullanicilar, kullaniciFirmalar } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireYonetici } from "../middleware/auth";

const router = Router();

router.get("/kullanicilar", requireYonetici, async (req, res) => {
  try {
    const rows = await db
      .select({ id: kullanicilar.id, ad: kullanicilar.ad, email: kullanicilar.email, rol: kullanicilar.rol, aktif: kullanicilar.aktif, olusturmaTarihi: kullanicilar.olusturmaTarihi })
      .from(kullanicilar)
      .orderBy(kullanicilar.ad);

    const firmaRows = await db.select().from(kullaniciFirmalar);
    const firmaMap: Record<number, Array<{ sirketId: number; rol: string }>> = {};
    for (const s of firmaRows) {
      if (!firmaMap[s.kullaniciId]) firmaMap[s.kullaniciId] = [];
      firmaMap[s.kullaniciId].push({ sirketId: s.catiFirmaId, rol: s.rol });
    }

    res.json(rows.map((k) => ({ ...k, sirketler: firmaMap[k.id] ?? [] })));
  } catch {
    res.status(500).json({ error: "Kullanıcılar listelenemedi" });
  }
});

router.post("/kullanicilar", requireYonetici, async (req, res) => {
  try {
    const { ad, email, parola, rol, sirketler: sirketAtamalari } = req.body;
    if (!ad || !email || !parola) {
      res.status(400).json({ error: "Ad, email ve parola zorunludur" });
      return;
    }

    const hash = await bcrypt.hash(parola, 12);
    const [yeni] = await db
      .insert(kullanicilar)
      .values({ ad, email: email.toLowerCase().trim(), parola: hash, rol: rol ?? "muhasebeci" })
      .returning();

    if (sirketAtamalari?.length) {
      await db.insert(kullaniciFirmalar).values(
        sirketAtamalari.map((s: { sirketId: number; rol?: string }) => ({
          kullaniciId: yeni.id,
          catiFirmaId: s.sirketId,
          rol: s.rol ?? "muhasebeci",
        }))
      );
    }

    const { parola: _, ...safe } = yeni;
    res.status(201).json(safe);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique")) { res.status(409).json({ error: "Bu email zaten kayıtlı" }); return; }
    res.status(500).json({ error: "Kullanıcı oluşturulamadı" });
  }
});

router.put("/kullanicilar/:id", requireYonetici, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { ad, email, parola, rol, aktif, sirketler: sirketAtamalari } = req.body;

    const guncelle: Partial<typeof kullanicilar.$inferInsert> = {};
    if (ad) guncelle.ad = ad;
    if (email) guncelle.email = email.toLowerCase().trim();
    if (parola) guncelle.parola = await bcrypt.hash(parola, 12);
    if (rol) guncelle.rol = rol;
    if (aktif !== undefined) guncelle.aktif = aktif;

    if (Object.keys(guncelle).length > 0) {
      await db.update(kullanicilar).set(guncelle).where(eq(kullanicilar.id, id));
    }

    if (sirketAtamalari !== undefined) {
      await db.delete(kullaniciFirmalar).where(eq(kullaniciFirmalar.kullaniciId, id));
      if (sirketAtamalari.length > 0) {
        await db.insert(kullaniciFirmalar).values(
          sirketAtamalari.map((s: { sirketId: number; rol?: string }) => ({
            kullaniciId: id,
            catiFirmaId: s.sirketId,
            rol: s.rol ?? "muhasebeci",
          }))
        );
      }
    }

    const [guncellenen] = await db
      .select({ id: kullanicilar.id, ad: kullanicilar.ad, email: kullanicilar.email, rol: kullanicilar.rol, aktif: kullanicilar.aktif })
      .from(kullanicilar)
      .where(eq(kullanicilar.id, id));

    res.json(guncellenen);
  } catch {
    res.status(500).json({ error: "Kullanıcı güncellenemedi" });
  }
});

router.delete("/kullanicilar/:id", requireYonetici, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (req.kullanici?.id === id) {
      res.status(400).json({ error: "Kendi hesabınızı silemezsiniz" });
      return;
    }
    await db.delete(kullanicilar).where(eq(kullanicilar.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Kullanıcı silinemedi" });
  }
});

export default router;
