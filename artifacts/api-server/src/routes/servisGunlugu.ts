import { Router, type NextFunction, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { servisFotograflari, servisKayitlari, servisNotlari, kullanicilar } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireYazma, firmaYazmaDenetimi, sirketErisimKontrol } from "../middleware/auth";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const router = Router();
const UPLOAD_DIR = path.join(process.cwd(), "servis-gunluk-uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const image = /^image\//i.test(file.mimetype)
      || /\.(heic|heif|jpg|jpeg|png|gif|webp|avif)$/i.test(file.originalname);
    cb(null, image);
  },
});

function isImage(file: Pick<Express.Multer.File, "mimetype" | "originalname">): boolean {
  return /^image\//i.test(file.mimetype)
    || /\.(heic|heif|jpg|jpeg|png|gif|webp|avif)$/i.test(file.originalname);
}

// ── Startup file recovery ────────────────────────────────────────────────────
// Reconcile staged (.pending-) and quarantined (.deleting-) files against DB.
let kurtarmaCalisiyor: Promise<void> | null = null;

function kurtarmaYap(): Promise<void> {
  if (kurtarmaCalisiyor) return kurtarmaCalisiyor;
  kurtarmaCalisiyor = kurtarmayiCalistir().finally(() => { kurtarmaCalisiyor = null; });
  return kurtarmaCalisiyor;
}

async function kurtarmayiCalistir(): Promise<void> {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    await Promise.allSettled(files.map(async (filename) => {
      if (filename.includes(".pending-")) {
        // pending-TIMESTAMP_HEX_FINALNAME.jpg
        const finalName = filename.replace(/^.*\.pending-/, "");
        const pendingPath = path.join(UPLOAD_DIR, filename);
        const finalPath = path.join(UPLOAD_DIR, finalName);
        const [row] = await db
          .select({ id: servisFotograflari.id })
          .from(servisFotograflari)
          .where(eq(servisFotograflari.dosyaYolu, finalName));
        if (row) {
          // DB committed but promotion failed — promote now
          try { fs.renameSync(pendingPath, finalPath); } catch { /* retry next boot */ }
        } else {
          // DB never committed — clean up
          try { fs.unlinkSync(pendingPath); } catch { /* already gone */ }
        }
      } else if (filename.includes(".deleting-")) {
        // deleting-TIMESTAMP_originalName
        const originalName = filename.replace(/^[^.]*\.deleting-/, "");
        const quarantinePath = path.join(UPLOAD_DIR, filename);
        const [row] = await db
          .select({ id: servisFotograflari.id })
          .from(servisFotograflari)
          .where(eq(servisFotograflari.dosyaYolu, originalName));
        if (row) {
          // DB delete failed — restore file
          try { fs.renameSync(quarantinePath, path.join(UPLOAD_DIR, originalName)); } catch { /* retry next boot */ }
        } else {
          // DB deleted — finish cleanup
          try { fs.unlinkSync(quarantinePath); } catch { /* already gone */ }
        }
      }
    }));
  } catch (err) {
    console.error("[servis-gunlugu] Başlangıç kurtarma hatası:", err);
  }
}

void kurtarmaYap();

async function saveImage(file: Express.Multer.File): Promise<{ geciciYol: string; finalAd: string; boyut: number }> {
  const finalAd = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}.jpg`;
  const geciciAd = `${Date.now()}.pending-${finalAd}`;
  const geciciYol = path.join(UPLOAD_DIR, geciciAd);
  try {
    await sharp(file.buffer)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(geciciYol);
    return { geciciYol, finalAd, boyut: fs.statSync(geciciYol).size };
  } catch (err) {
    try { fs.unlinkSync(geciciYol); } catch { /* already gone */ }
    throw err;
  }
}

// ── Access helpers ───────────────────────────────────────────────────────────
async function getServisErisimi(servisId: number, req: Request) {
  const [kayit] = await db
    .select({ id: servisKayitlari.id, catiFirmaId: servisKayitlari.catiFirmaId })
    .from(servisKayitlari)
    .where(eq(servisKayitlari.id, servisId));
  if (!kayit) return null;
  return sirketErisimKontrol(kayit.catiFirmaId, req) ? kayit : null;
}

async function gunlukYazmaYetkisi(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const servisId = Number(req.params.id);
    const kayit = await getServisErisimi(servisId, req);
    if (!kayit) {
      res.status(404).json({ error: "Servis kaydı bulunamadı veya erişim izniniz yok" });
      return;
    }
    if (!firmaYazmaDenetimi(kayit.catiFirmaId, req)) {
      res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.get("/servis-kayitlari/:id/gunluk", async (req, res) => {
  await kurtarmaYap();
  try {
    const servisId = Number(req.params.id);
    const kayit = await getServisErisimi(servisId, req);
    if (!kayit) { res.status(404).json({ error: "Servis kaydı bulunamadı veya erişim izniniz yok" }); return; }

    const [notlar, fotograflar] = await Promise.all([
      db.select({
        id: servisNotlari.id,
        metin: servisNotlari.metin,
        olusturanKullaniciId: servisNotlari.olusturanKullaniciId,
        olusturmaTarihi: servisNotlari.olusturmaTarihi,
        olusturanAd: kullanicilar.ad,
      })
        .from(servisNotlari)
        .leftJoin(kullanicilar, eq(servisNotlari.olusturanKullaniciId, kullanicilar.id))
        .where(eq(servisNotlari.servisId, servisId))
        .orderBy(desc(servisNotlari.olusturmaTarihi)),
      db.select({
        id: servisFotograflari.id,
        dosyaYolu: servisFotograflari.dosyaYolu,
        dosyaTipi: servisFotograflari.dosyaTipi,
        boyut: servisFotograflari.boyut,
        orijinalAd: servisFotograflari.orijinalAd,
        olusturanKullaniciId: servisFotograflari.olusturanKullaniciId,
        olusturmaTarihi: servisFotograflari.olusturmaTarihi,
        olusturanAd: kullanicilar.ad,
      })
        .from(servisFotograflari)
        .leftJoin(kullanicilar, eq(servisFotograflari.olusturanKullaniciId, kullanicilar.id))
        .where(eq(servisFotograflari.servisId, servisId))
        .orderBy(desc(servisFotograflari.olusturmaTarihi)),
    ]);
    res.json({ notlar, fotograflar });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Servis günlüğü alınamadı" });
  }
});

router.post("/servis-kayitlari/:id/gunluk/notlar", requireYazma, async (req, res) => {
  await kurtarmaYap();
  try {
    const servisId = Number(req.params.id);
    const kayit = await getServisErisimi(servisId, req);
    if (!kayit) { res.status(404).json({ error: "Servis kaydı bulunamadı veya erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(kayit.catiFirmaId, req)) {
      res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return;
    }

    const metin = typeof req.body?.metin === "string" ? req.body.metin.trim() : "";
    if (!metin) { res.status(400).json({ error: "Not metni zorunludur" }); return; }
    if (metin.length > 5000) { res.status(400).json({ error: "Not en fazla 5000 karakter olabilir" }); return; }

    const [not] = await db.insert(servisNotlari).values({
      servisId,
      metin,
      olusturanKullaniciId: req.kullanici?.id ?? null,
    }).returning();
    res.status(201).json({ ...not, olusturanAd: req.kullanici?.ad ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Not eklenemedi" });
  }
});

router.delete("/servis-notlari/:id", requireYazma, async (req, res) => {
  await kurtarmaYap();
  try {
    const id = Number(req.params.id);
    const [not] = await db.select().from(servisNotlari).where(eq(servisNotlari.id, id));
    if (!not) { res.status(404).json({ error: "Not bulunamadı" }); return; }
    const kayit = await getServisErisimi(not.servisId, req);
    if (!kayit) { res.status(404).json({ error: "Servis kaydı bulunamadı veya erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(kayit.catiFirmaId, req)) {
      res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return;
    }
    // Only the creator or yonetici can delete
    if (req.kullanici?.rol !== "yonetici" && not.olusturanKullaniciId !== req.kullanici?.id) {
      res.status(403).json({ error: "Bu notu yalnızca oluşturan kullanıcı silebilir" }); return;
    }
    await db.delete(servisNotlari).where(eq(servisNotlari.id, id));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Not silinemedi" });
  }
});

router.post("/servis-kayitlari/:id/gunluk/fotograflar", requireYazma, gunlukYazmaYetkisi, upload.array("fotograflar", 10), async (req, res) => {
  await kurtarmaYap();
  try {
    const servisId = Number(req.params.id);
    const kayit = await getServisErisimi(servisId, req);
    if (!kayit) { res.status(404).json({ error: "Servis kaydı bulunamadı veya erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(kayit.catiFirmaId, req)) {
      res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return;
    }

    const files = (req.files ?? []) as Express.Multer.File[];
    if (!files.length) { res.status(400).json({ error: "Fotoğraf seçilmedi" }); return; }
    if (files.some(file => !isImage(file))) { res.status(400).json({ error: "Yalnızca fotoğraf yükleyebilirsiniz" }); return; }

    const savedFiles: Array<{ file: Express.Multer.File; geciciYol: string; finalAd: string; boyut: number }> = [];
    let metadataKaydedildi = false;
    try {
      for (const file of files) savedFiles.push({ file, ...(await saveImage(file)) });

      const savedRows = await db.transaction(async tx => {
        const rows = [];
        for (const saved of savedFiles) {
          const [row] = await tx.insert(servisFotograflari).values({
            servisId,
            dosyaYolu: saved.finalAd,
            dosyaTipi: "image/jpeg",
            boyut: saved.boyut,
            orijinalAd: saved.file.originalname,
            olusturanKullaniciId: req.kullanici?.id ?? null,
          }).returning();
          rows.push(row);
        }
        return rows;
      });

      metadataKaydedildi = true;

      // Promote pending files to final names
      const stillPending: string[] = [];
      for (const saved of savedFiles) {
        try {
          fs.renameSync(saved.geciciYol, path.join(UPLOAD_DIR, saved.finalAd));
        } catch {
          stillPending.push(saved.finalAd);
        }
      }

      if (stillPending.length > 0) {
        // Try immediate recovery for failed promotions
        await kurtarmaYap();
        const remaining = stillPending.filter(name => !fs.existsSync(path.join(UPLOAD_DIR, name)));
        if (remaining.length > 0) {
          res.status(202).json(savedRows); // Metadata saved; files will reconcile on next restart
          return;
        }
      }

      res.status(201).json(savedRows);
    } catch (err) {
      if (!metadataKaydedildi) {
        // Pre-commit failure: clean up pending files
        for (const saved of savedFiles) {
          try { fs.unlinkSync(saved.geciciYol); } catch { /* already gone */ }
        }
      }
      // If post-commit: pending files must not be deleted; reconciliation handles them
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fotoğraflar yüklenemedi" });
  }
});

router.get("/servis-fotograflari/:id/dosya", async (req, res) => {
  await kurtarmaYap();
  try {
    const id = Number(req.params.id);
    const [foto] = await db.select().from(servisFotograflari).where(eq(servisFotograflari.id, id));
    if (!foto) { res.status(404).json({ error: "Fotoğraf bulunamadı" }); return; }
    const kayit = await getServisErisimi(foto.servisId, req);
    if (!kayit) { res.status(404).json({ error: "Fotoğraf bulunamadı veya erişim izniniz yok" }); return; }

    const filePath = path.join(UPLOAD_DIR, foto.dosyaYolu);
    if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Fotoğraf diskte bulunamadı" }); return; }
    res.setHeader("Content-Type", foto.dosyaTipi);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(filePath);
  } catch {
    res.status(500).json({ error: "Fotoğraf sunulamadı" });
  }
});

router.delete("/servis-fotograflari/:id", requireYazma, async (req, res) => {
  await kurtarmaYap();
  try {
    const id = Number(req.params.id);
    const [foto] = await db.select().from(servisFotograflari).where(eq(servisFotograflari.id, id));
    if (!foto) { res.status(404).json({ error: "Fotoğraf bulunamadı" }); return; }
    const kayit = await getServisErisimi(foto.servisId, req);
    if (!kayit) { res.status(404).json({ error: "Fotoğraf bulunamadı veya erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(kayit.catiFirmaId, req)) {
      res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return;
    }
    if (req.kullanici?.rol !== "yonetici" && foto.olusturanKullaniciId !== req.kullanici?.id) {
      res.status(403).json({ error: "Bu fotoğrafı yalnızca yükleyen kullanıcı silebilir" }); return;
    }

    // Quarantine-then-delete for atomicity
    const quarantineAd = `${Date.now()}.deleting-${foto.dosyaYolu}`;
    const originalPath = path.join(UPLOAD_DIR, foto.dosyaYolu);
    const quarantinePath = path.join(UPLOAD_DIR, quarantineAd);
    if (fs.existsSync(originalPath)) {
      fs.renameSync(originalPath, quarantinePath);
    }
    try {
      await db.delete(servisFotograflari).where(eq(servisFotograflari.id, id));
      // DB deleted — remove quarantine file
      try { fs.unlinkSync(quarantinePath); } catch { /* harmless */ }
    } catch (dbErr) {
      // DB failed — restore file
      try { fs.renameSync(quarantinePath, originalPath); } catch { /* will reconcile on next boot */ }
      throw dbErr;
    }
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Fotoğraf silinemedi" });
  }
});

export default router;
