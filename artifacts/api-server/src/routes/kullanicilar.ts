import { Router } from "express";
import { db } from "@workspace/db";
import { kullanicilar, kullaniciFirmalar } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireYonetici } from "../middleware/auth";
import { gecerliModulListesi, modulCacheTemizle } from "../lib/moduller";

const router = Router();

router.get("/kullanicilar", requireYonetici, async (req, res) => {
  try {
    const rows = await db
      .select({ id: kullanicilar.id, ad: kullanicilar.ad, email: kullanicilar.email, rol: kullanicilar.rol, aktif: kullanicilar.aktif, modulIzinleri: kullanicilar.modulIzinleri, olusturmaTarihi: kullanicilar.olusturmaTarihi, sonGirisTarihi: kullanicilar.sonGirisTarihi })
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
    const { ad, email, parola, rol, sirketler: sirketAtamalari, modulIzinleri } = req.body;
    if (!ad || !email || !parola) {
      res.status(400).json({ error: "Ad, email ve parola zorunludur" });
      return;
    }

    const etkinRol = rol ?? "muhasebeci";
    // Yönetici her zaman tüm modüllere erişir; diğerlerinde geçersiz anahtarlar ayıklanır.
    const moduller = etkinRol === "yonetici" ? null : gecerliModulListesi(modulIzinleri);
    if (Array.isArray(moduller) && moduller.length === 0) {
      res.status(400).json({ error: "En az bir modül izni seçilmelidir" });
      return;
    }

    const hash = await bcrypt.hash(parola, 12);
    const [yeni] = await db
      .insert(kullanicilar)
      .values({ ad, email: email.toLowerCase().trim(), parola: hash, rol: etkinRol, modulIzinleri: moduller ?? null })
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
    const { ad, email, parola, rol, aktif, sirketler: sirketAtamalari, modulIzinleri } = req.body;

    const guncelle: Partial<typeof kullanicilar.$inferInsert> = {};
    if (ad) guncelle.ad = ad;
    if (email) guncelle.email = email.toLowerCase().trim();
    if (parola) guncelle.parola = await bcrypt.hash(parola, 12);
    if (rol) guncelle.rol = rol;
    if (aktif !== undefined) guncelle.aktif = aktif;

    const [mevcut] = await db
      .select({ rol: kullanicilar.rol })
      .from(kullanicilar)
      .where(eq(kullanicilar.id, id));
    if (!mevcut) { res.status(404).json({ error: "Kullanıcı bulunamadı" }); return; }

    const etkinRol = rol ?? mevcut.rol;
    if (etkinRol === "yonetici") {
      guncelle.modulIzinleri = null;
    } else if (modulIzinleri !== undefined) {
      const moduller = gecerliModulListesi(modulIzinleri);
      if (Array.isArray(moduller) && moduller.length === 0) {
        res.status(400).json({ error: "En az bir modül izni seçilmelidir" });
        return;
      }
      guncelle.modulIzinleri = moduller ?? null;
    }

    if (Object.keys(guncelle).length > 0) {
      await db.update(kullanicilar).set(guncelle).where(eq(kullanicilar.id, id));
      modulCacheTemizle(id);
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
      .select({ id: kullanicilar.id, ad: kullanicilar.ad, email: kullanicilar.email, rol: kullanicilar.rol, aktif: kullanicilar.aktif, modulIzinleri: kullanicilar.modulIzinleri })
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
    modulCacheTemizle(id);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Kullanıcı silinemedi" });
  }
});

export default router;
