import { Router } from "express";
import { db } from "@workspace/db";
import { kullanicilar, kullaniciSirketler } from "@workspace/db/schema";
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

    const sirketRows = await db.select().from(kullaniciSirketler);
    const sirketMap: Record<number, Array<{ sirketId: number; rol: string }>> = {};
    for (const s of sirketRows) {
      if (!sirketMap[s.kullaniciId]) sirketMap[s.kullaniciId] = [];
      sirketMap[s.kullaniciId].push({ sirketId: s.sirketId, rol: s.rol });
    }

    res.json(rows.map((k) => ({ ...k, sirketler: sirketMap[k.id] ?? [] })));
  } catch (err) {
    res.status(500).json({ error: "Kullanıcılar listelenemedi" });
  }
});

router.post("/kullanicilar", requireYonetici, async (req, res) => {
  try {
    const { ad, email, parola, rol, sirketler: sirketAtamalari } = req.body;
    if (!ad || !email || !parola) {
      return res.status(400).json({ error: "Ad, email ve parola zorunludur" });
    }

    const hash = await bcrypt.hash(parola, 12);
    const [yeni] = await db
      .insert(kullanicilar)
      .values({ ad, email: email.toLowerCase().trim(), parola: hash, rol: rol ?? "muhasebeci" })
      .returning();

    if (sirketAtamalari?.length) {
      await db.insert(kullaniciSirketler).values(
        sirketAtamalari.map((s: { sirketId: number; rol?: string }) => ({
          kullaniciId: yeni.id,
          sirketId: s.sirketId,
          rol: s.rol ?? "muhasebeci",
        }))
      );
    }

    const { parola: _, ...safe } = yeni;
    res.status(201).json(safe);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique")) return res.status(409).json({ error: "Bu email zaten kayıtlı" });
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
      await db.delete(kullaniciSirketler).where(eq(kullaniciSirketler.kullaniciId, id));
      if (sirketAtamalari.length > 0) {
        await db.insert(kullaniciSirketler).values(
          sirketAtamalari.map((s: { sirketId: number; rol?: string }) => ({
            kullaniciId: id,
            sirketId: s.sirketId,
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
  } catch (err) {
    res.status(500).json({ error: "Kullanıcı güncellenemedi" });
  }
});

router.delete("/kullanicilar/:id", requireYonetici, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (req.kullanici?.id === id) {
      return res.status(400).json({ error: "Kendi hesabınızı silemezsiniz" });
    }
    await db.delete(kullanicilar).where(eq(kullanicilar.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Kullanıcı silinemedi" });
  }
});

export default router;
