import { Router } from "express";
import { db } from "@workspace/db";
import { firmalar, gemiFotograflari, gemiNotlari, gemiler, kullanicilar } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireYazma, firmaYazmaDenetimi } from "../middleware/auth";
import { gorunurBagliFirmaIds } from "../utils/gorunurluk";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const router = Router();
const UPLOAD_DIR = path.join(process.cwd(), "gemi-uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const TEMP_DELETE_MARKER = ".deleting-";
const TEMP_UPLOAD_MARKER = ".pending-";

async function geciciSilinenDosyalariKurtar() {
  for (const name of fs.readdirSync(UPLOAD_DIR)) {
    const marker = name.includes(TEMP_DELETE_MARKER)
      ? TEMP_DELETE_MARKER
      : name.includes(TEMP_UPLOAD_MARKER)
        ? TEMP_UPLOAD_MARKER
        : null;
    if (!marker) continue;

    const dosyaYolu = name.split(marker)[0];
    if (!dosyaYolu) continue;
    const geciciYol = path.join(UPLOAD_DIR, name);
    const asilYol = path.join(UPLOAD_DIR, dosyaYolu);

    try {
      const [foto] = await db.select({ id: gemiFotograflari.id })
        .from(gemiFotograflari)
        .where(eq(gemiFotograflari.dosyaYolu, dosyaYolu));
      if (foto) {
        if (fs.existsSync(asilYol)) fs.unlinkSync(geciciYol);
        else fs.renameSync(geciciYol, asilYol);
      } else {
        fs.unlinkSync(geciciYol);
      }
    } catch (err) {
      console.error("[gemi-gunlugu] geçici fotoğraf kurtarılamadı", err);
    }
  }
}
const geciciDosyaKurtarmaHazir = geciciSilinenDosyalariKurtar();

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

function silebilirMi(olusturanKullaniciId: number | null, req: Express.Request): boolean {
  return req.kullanici?.rol === "yonetici"
    || (olusturanKullaniciId != null && olusturanKullaniciId === req.kullanici?.id);
}

function geciciSilmeYolu(dosyaYolu: string): string {
  return path.join(UPLOAD_DIR, `${dosyaYolu}${TEMP_DELETE_MARKER}${crypto.randomBytes(4).toString("hex")}`);
}

async function getGemiErisimi(gemiId: number, req: Express.Request) {
  const [row] = await db
    .select({ gemiId: gemiler.id, firmaId: gemiler.firmaId, firmaAd: firmalar.ad })
    .from(gemiler)
    .leftJoin(firmalar, eq(gemiler.firmaId, firmalar.id))
    .where(eq(gemiler.id, gemiId));
  if (!row) return null;
  if (req.kullanici?.rol === "yonetici") return { ...row, catiFirmaId: null };

  for (const catiFirmaId of req.izinliSirketler ?? []) {
    const gorunurFirmaIds = await gorunurBagliFirmaIds(catiFirmaId);
    if (gorunurFirmaIds.includes(row.firmaId)) return { ...row, catiFirmaId };
  }
  return null;
}

async function saveImage(file: Express.Multer.File): Promise<{ dosyaYolu: string; geciciYol: string; boyut: number }> {
  const dosyaYolu = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}.jpg`;
  const geciciYol = path.join(UPLOAD_DIR, `${dosyaYolu}${TEMP_UPLOAD_MARKER}${crypto.randomBytes(4).toString("hex")}`);
  try {
    await sharp(file.buffer)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(geciciYol);
    return { dosyaYolu, geciciYol, boyut: fs.statSync(geciciYol).size };
  } catch (err) {
    if (fs.existsSync(geciciYol)) fs.unlinkSync(geciciYol);
    throw err;
  }
}

router.use(async (_req, _res, next) => {
  try {
    await geciciDosyaKurtarmaHazir;
    next();
  } catch (err) {
    next(err);
  }
});

router.get("/gemiler/:id/gunluk", async (req, res) => {
  try {
    const gemiId = Number(req.params.id);
    const gemi = await getGemiErisimi(gemiId, req);
    if (!gemi) { res.status(404).json({ error: "Gemi bulunamadı veya erişim izniniz yok" }); return; }

    const [notlar, fotograflar] = await Promise.all([
      db.select({
        id: gemiNotlari.id,
        metin: gemiNotlari.metin,
        olusturanKullaniciId: gemiNotlari.olusturanKullaniciId,
        olusturmaTarihi: gemiNotlari.olusturmaTarihi,
        olusturanAd: kullanicilar.ad,
      })
        .from(gemiNotlari)
        .leftJoin(kullanicilar, eq(gemiNotlari.olusturanKullaniciId, kullanicilar.id))
        .where(eq(gemiNotlari.gemiId, gemiId))
        .orderBy(desc(gemiNotlari.olusturmaTarihi)),
      db.select({
        id: gemiFotograflari.id,
        dosyaYolu: gemiFotograflari.dosyaYolu,
        dosyaTipi: gemiFotograflari.dosyaTipi,
        boyut: gemiFotograflari.boyut,
        orijinalAd: gemiFotograflari.orijinalAd,
        olusturanKullaniciId: gemiFotograflari.olusturanKullaniciId,
        olusturmaTarihi: gemiFotograflari.olusturmaTarihi,
        olusturanAd: kullanicilar.ad,
      }).from(gemiFotograflari)
        .leftJoin(kullanicilar, eq(gemiFotograflari.olusturanKullaniciId, kullanicilar.id))
        .where(eq(gemiFotograflari.gemiId, gemiId))
        .orderBy(desc(gemiFotograflari.olusturmaTarihi)),
    ]);
    res.json({ notlar, fotograflar });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gemi günlüğü alınamadı" });
  }
});

router.post("/gemiler/:id/notlar", requireYazma, async (req, res) => {
  try {
    const gemiId = Number(req.params.id);
    const gemi = await getGemiErisimi(gemiId, req);
    if (!gemi) { res.status(404).json({ error: "Gemi bulunamadı veya erişim izniniz yok" }); return; }
    if (gemi.catiFirmaId != null && !firmaYazmaDenetimi(gemi.catiFirmaId, req)) {
      res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" });
      return;
    }

    const metin = typeof req.body?.metin === "string" ? req.body.metin.trim() : "";
    if (!metin) { res.status(400).json({ error: "Not metni zorunludur" }); return; }
    if (metin.length > 5000) { res.status(400).json({ error: "Not en fazla 5000 karakter olabilir" }); return; }

    const [not] = await db.insert(gemiNotlari).values({
      gemiId,
      metin,
      olusturanKullaniciId: req.kullanici?.id ?? null,
    }).returning();
    res.status(201).json({ ...not, olusturanAd: req.kullanici?.ad ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Not eklenemedi" });
  }
});

router.delete("/gemi-notlari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [not] = await db.select().from(gemiNotlari).where(eq(gemiNotlari.id, id));
    if (!not) { res.status(404).json({ error: "Not bulunamadı" }); return; }
    const gemi = await getGemiErisimi(not.gemiId, req);
    if (!gemi) { res.status(404).json({ error: "Gemi bulunamadı veya erişim izniniz yok" }); return; }
    if (gemi.catiFirmaId != null && !firmaYazmaDenetimi(gemi.catiFirmaId, req)) {
      res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" });
      return;
    }
    if (!silebilirMi(not.olusturanKullaniciId, req)) {
      res.status(403).json({ error: "Yalnızca kendi eklediğiniz notu silebilirsiniz" });
      return;
    }
    await db.delete(gemiNotlari).where(eq(gemiNotlari.id, id));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Not silinemedi" });
  }
});

router.post("/gemiler/:id/fotograflar", requireYazma, upload.array("fotograflar", 10), async (req, res) => {
  try {
    const gemiId = Number(req.params.id);
    const gemi = await getGemiErisimi(gemiId, req);
    if (!gemi) { res.status(404).json({ error: "Gemi bulunamadı veya erişim izniniz yok" }); return; }
    if (gemi.catiFirmaId != null && !firmaYazmaDenetimi(gemi.catiFirmaId, req)) {
      res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" });
      return;
    }

    const files = (req.files ?? []) as Express.Multer.File[];
    if (!files.length) { res.status(400).json({ error: "Fotoğraf seçilmedi" }); return; }
    if (files.some(file => !isImage(file))) { res.status(400).json({ error: "Yalnızca fotoğraf yükleyebilirsiniz" }); return; }

    const savedFiles: Array<{ file: Express.Multer.File; dosyaYolu: string; geciciYol: string; boyut: number }> = [];
    let metadataKaydedildi = false;
    let savedRows: Array<typeof gemiFotograflari.$inferSelect> = [];
    try {
      for (const file of files) savedFiles.push({ file, ...(await saveImage(file)) });
      savedRows = await db.transaction(async tx => {
        const rows = [];
        for (const saved of savedFiles) {
          const [row] = await tx.insert(gemiFotograflari).values({
            gemiId,
            dosyaYolu: saved.dosyaYolu,
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
      for (const saved of savedFiles) fs.renameSync(saved.geciciYol, path.join(UPLOAD_DIR, saved.dosyaYolu));
      res.status(201).json(savedRows);
    } catch (err) {
      if (metadataKaydedildi) {
        await geciciSilinenDosyalariKurtar();
        const tamamlanamayan = savedFiles.some(saved => fs.existsSync(saved.geciciYol));
        if (tamamlanamayan) {
          res.status(202).json(savedRows);
          return;
        }
        res.status(201).json(savedRows);
        return;
      }
      for (const saved of savedFiles) {
        try {
          if (fs.existsSync(saved.geciciYol)) fs.unlinkSync(saved.geciciYol);
        } catch (cleanupError) {
          console.error("[gemi-gunlugu] yarım yükleme dosyası temizlenemedi", cleanupError);
        }
      }
      await geciciSilinenDosyalariKurtar();
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fotoğraflar yüklenemedi" });
  }
});

router.get("/gemi-fotograflari/:id/dosya", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [foto] = await db.select().from(gemiFotograflari).where(eq(gemiFotograflari.id, id));
    if (!foto) { res.status(404).json({ error: "Fotoğraf bulunamadı" }); return; }
    const gemi = await getGemiErisimi(foto.gemiId, req);
    if (!gemi) { res.status(404).json({ error: "Fotoğraf bulunamadı veya erişim izniniz yok" }); return; }

    const filePath = path.join(UPLOAD_DIR, foto.dosyaYolu);
    if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Fotoğraf diskte bulunamadı" }); return; }
    res.setHeader("Content-Type", foto.dosyaTipi);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(filePath);
  } catch {
    res.status(500).json({ error: "Fotoğraf sunulamadı" });
  }
});

router.delete("/gemi-fotograflari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [foto] = await db.select().from(gemiFotograflari).where(eq(gemiFotograflari.id, id));
    if (!foto) { res.status(404).json({ error: "Fotoğraf bulunamadı" }); return; }
    const gemi = await getGemiErisimi(foto.gemiId, req);
    if (!gemi) { res.status(404).json({ error: "Fotoğraf bulunamadı veya erişim izniniz yok" }); return; }
    if (gemi.catiFirmaId != null && !firmaYazmaDenetimi(gemi.catiFirmaId, req)) {
      res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" });
      return;
    }
    if (!silebilirMi(foto.olusturanKullaniciId, req)) {
      res.status(403).json({ error: "Yalnızca kendi eklediğiniz fotoğrafı silebilirsiniz" });
      return;
    }

    const filePath = path.join(UPLOAD_DIR, foto.dosyaYolu);
    const geciciYol = geciciSilmeYolu(foto.dosyaYolu);
    const tasindi = fs.existsSync(filePath);
    if (tasindi) fs.renameSync(filePath, geciciYol);
    try {
      await db.delete(gemiFotograflari).where(eq(gemiFotograflari.id, id));
    } catch (err) {
      if (tasindi && fs.existsSync(geciciYol)) fs.renameSync(geciciYol, filePath);
      throw err;
    }
    if (tasindi) {
      try {
        fs.unlinkSync(geciciYol);
      } catch (err) {
        console.error("[gemi-gunlugu] silinen fotoğrafın geçici dosyası temizlenemedi", err);
      }
    }
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Fotoğraf silinemedi" });
  }
});

export default router;