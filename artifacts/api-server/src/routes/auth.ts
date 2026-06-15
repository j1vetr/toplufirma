import { Router } from "express";
import { db } from "@workspace/db";
import { kullanicilar, kullaniciFirmalar } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET, requireAuth } from "../middleware/auth";

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const { email, parola } = req.body as { email?: string; parola?: string };
    if (!email || !parola) {
      res.status(400).json({ error: "Email ve parola zorunludur" });
      return;
    }

    const [kullanici] = await db
      .select()
      .from(kullanicilar)
      .where(eq(kullanicilar.email, email.toLowerCase().trim()));

    if (!kullanici || !kullanici.aktif) {
      res.status(401).json({ error: "Geçersiz email veya parola" });
      return;
    }

    const eslesme = await bcrypt.compare(parola, kullanici.parola);
    if (!eslesme) {
      res.status(401).json({ error: "Geçersiz email veya parola" });
      return;
    }

    const firmaRows = await db
      .select()
      .from(kullaniciFirmalar)
      .where(eq(kullaniciFirmalar.kullaniciId, kullanici.id));

    const sirketler = firmaRows.map((s) => ({ sirketId: s.catiFirmaId, rol: s.rol }));

    const payload = {
      id: kullanici.id,
      email: kullanici.email,
      ad: kullanici.ad,
      rol: kullanici.rol,
      sirketler,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

    res.json({ token, kullanici: payload });
  } catch {
    res.status(500).json({ error: "Giriş yapılamadı" });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const [kullanici] = await db
      .select({ id: kullanicilar.id, ad: kullanicilar.ad, email: kullanicilar.email, rol: kullanicilar.rol })
      .from(kullanicilar)
      .where(eq(kullanicilar.id, req.kullanici!.id));

    if (!kullanici) { res.status(404).json({ error: "Kullanıcı bulunamadı" }); return; }

    const firmaRows = await db
      .select()
      .from(kullaniciFirmalar)
      .where(eq(kullaniciFirmalar.kullaniciId, kullanici.id));

    res.json({ ...kullanici, sirketler: firmaRows.map((s) => ({ sirketId: s.catiFirmaId, rol: s.rol })) });
  } catch {
    res.status(500).json({ error: "Kullanıcı bilgisi alınamadı" });
  }
});

export default router;
