import { Router } from "express";
import { db } from "@workspace/db";
import { servisKayitlari, servisDosyalari, gemiler, firmalar } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), "servis-uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /^image\/(jpeg|png|gif|webp|heic|heif)$/i.test(file.mimetype) || /\.(pdf|doc|docx)$/i.test(file.originalname);
    cb(null, ok);
  },
});

function isImage(mimetype: string): boolean {
  return /^image\//i.test(mimetype);
}

async function saveFile(file: Express.Multer.File): Promise<{ dosyaYolu: string; boyut: number }> {
  const ext = isImage(file.mimetype) ? ".jpg" : path.extname(file.originalname).toLowerCase() || ".bin";
  const name = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
  const dest = path.join(UPLOAD_DIR, name);

  if (isImage(file.mimetype)) {
    await sharp(file.buffer)
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(dest);
  } else {
    fs.writeFileSync(dest, file.buffer);
  }

  const stat = fs.statSync(dest);
  return { dosyaYolu: name, boyut: stat.size };
}

router.get("/servis-kayitlari", async (req, res) => {
  try {
    const { catiFirmaId, gemiId, kategori } = req.query as Record<string, string>;

    const rows = await db
      .select({
        k: servisKayitlari,
        gemiAd: gemiler.ad,
        gemiImo: gemiler.imoNumarasi,
      })
      .from(servisKayitlari)
      .leftJoin(gemiler, eq(servisKayitlari.gemiId, gemiler.id))
      .orderBy(desc(servisKayitlari.tarih));

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, catiFirmaId: r.k.catiFirmaId })), req, catiFirmaId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    let filtered = rows.filter(r => scoped.some(s => s.k.id === r.k.id));
    if (gemiId) filtered = filtered.filter(r => r.k.gemiId === Number(gemiId));
    if (kategori) filtered = filtered.filter(r => r.k.kategori === kategori);

    const ids = filtered.map(r => r.k.id);
    const dosyalar = ids.length
      ? await db.select().from(servisDosyalari).where(inArray(servisDosyalari.servisId, ids)).orderBy(servisDosyalari.olusturmaTarihi)
      : [];

    const dosyaMap: Record<number, typeof dosyalar> = {};
    for (const d of dosyalar) {
      if (!dosyaMap[d.servisId]) dosyaMap[d.servisId] = [];
      dosyaMap[d.servisId]!.push(d);
    }

    res.json(filtered.map(r => ({
      ...r.k,
      gemiAd: r.gemiAd ?? null,
      gemiImo: r.gemiImo ?? null,
      dosyalar: dosyaMap[r.k.id] ?? [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Servis kayıtları listelenemedi" });
  }
});

router.get("/servis-kayitlari/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ k: servisKayitlari, gemiAd: gemiler.ad, gemiImo: gemiler.imoNumarasi })
      .from(servisKayitlari)
      .leftJoin(gemiler, eq(servisKayitlari.gemiId, gemiler.id))
      .where(eq(servisKayitlari.id, id));
    if (!row) { res.status(404).json({ error: "Kayıt bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.k.catiFirmaId, req)) { res.status(403).json({ error: "Erişim yok" }); return; }
    const dosyalar = await db.select().from(servisDosyalari).where(eq(servisDosyalari.servisId, id)).orderBy(servisDosyalari.olusturmaTarihi);
    res.json({ ...row.k, gemiAd: row.gemiAd ?? null, gemiImo: row.gemiImo ?? null, dosyalar });
  } catch {
    res.status(500).json({ error: "Kayıt alınamadı" });
  }
});

router.post("/servis-kayitlari", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, gemiId, kategori, baslik, tarih, notlar } = req.body;
    if (!catiFirmaId || !gemiId || !baslik || !tarih) { res.status(400).json({ error: "Zorunlu alanlar eksik" }); return; }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Erişim yok" }); return; }

    const [gemiRow] = await db.select({ ustFirmaId: firmalar.ustFirmaId }).from(gemiler).leftJoin(firmalar, eq(gemiler.firmaId, firmalar.id)).where(eq(gemiler.id, Number(gemiId)));
    if (!gemiRow || gemiRow.ustFirmaId !== Number(catiFirmaId)) { res.status(400).json({ error: "Gemi bu firmaya ait değil" }); return; }

    const [row] = await db.insert(servisKayitlari).values({
      catiFirmaId: Number(catiFirmaId),
      gemiId: Number(gemiId),
      kategori: kategori ?? "servis",
      baslik,
      tarih,
      notlar: notlar || null,
    }).returning();
    res.status(201).json({ ...row, gemiAd: null, gemiImo: null, dosyalar: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Kayıt oluşturulamadı" });
  }
});

router.patch("/servis-kayitlari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(servisKayitlari).where(eq(servisKayitlari.id, id));
    if (!existing) { res.status(404).json({ error: "Kayıt bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Erişim yok" }); return; }

    const { kategori, baslik, tarih, notlar } = req.body;
    const [updated] = await db.update(servisKayitlari).set({
      ...(kategori !== undefined ? { kategori } : {}),
      ...(baslik !== undefined ? { baslik } : {}),
      ...(tarih !== undefined ? { tarih } : {}),
      ...(notlar !== undefined ? { notlar: notlar || null } : {}),
    }).where(eq(servisKayitlari.id, id)).returning();
    const dosyalar = await db.select().from(servisDosyalari).where(eq(servisDosyalari.servisId, id));
    res.json({ ...updated, dosyalar });
  } catch {
    res.status(500).json({ error: "Kayıt güncellenemedi" });
  }
});

router.delete("/servis-kayitlari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(servisKayitlari).where(eq(servisKayitlari.id, id));
    if (!existing) { res.status(404).json({ error: "Kayıt bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Erişim yok" }); return; }

    const dosyalar = await db.select().from(servisDosyalari).where(eq(servisDosyalari.servisId, id));
    for (const d of dosyalar) {
      const fp = path.join(UPLOAD_DIR, d.dosyaYolu);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.delete(servisKayitlari).where(eq(servisKayitlari.id, id));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Kayıt silinemedi" });
  }
});

router.post("/servis-kayitlari/:id/dosyalar", requireYazma, upload.array("dosyalar", 10), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(servisKayitlari).where(eq(servisKayitlari.id, id));
    if (!existing) { res.status(404).json({ error: "Kayıt bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Erişim yok" }); return; }

    const files = (req.files ?? []) as Express.Multer.File[];
    if (!files.length) { res.status(400).json({ error: "Dosya seçilmedi" }); return; }

    const saved = [];
    for (const file of files) {
      const { dosyaYolu, boyut } = await saveFile(file);
      const [row] = await db.insert(servisDosyalari).values({
        servisId: id,
        dosyaYolu,
        dosyaTipi: isImage(file.mimetype) ? "image/jpeg" : file.mimetype,
        boyut,
        orijinalAd: file.originalname,
      }).returning();
      saved.push(row);
    }
    res.status(201).json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Dosya yüklenemedi" });
  }
});

router.get("/servis-dosyalari/:id/dosya", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [dosya] = await db.select().from(servisDosyalari).where(eq(servisDosyalari.id, id));
    if (!dosya) { res.status(404).json({ error: "Dosya bulunamadı" }); return; }

    const [kayit] = await db.select().from(servisKayitlari).where(eq(servisKayitlari.id, dosya.servisId));
    if (!kayit) { res.status(404).json({ error: "Kayıt bulunamadı" }); return; }
    if (!sirketErisimKontrol(kayit.catiFirmaId, req)) { res.status(403).json({ error: "Erişim yok" }); return; }

    const fp = path.join(UPLOAD_DIR, dosya.dosyaYolu);
    if (!fs.existsSync(fp)) { res.status(404).json({ error: "Dosya diskte bulunamadı" }); return; }

    res.setHeader("Content-Type", dosya.dosyaTipi ?? "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(fp);
  } catch {
    res.status(500).json({ error: "Dosya sunulamadı" });
  }
});

router.delete("/servis-dosyalari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [dosya] = await db.select().from(servisDosyalari).where(eq(servisDosyalari.id, id));
    if (!dosya) { res.status(404).json({ error: "Dosya bulunamadı" }); return; }

    const [kayit] = await db.select().from(servisKayitlari).where(eq(servisKayitlari.id, dosya.servisId));
    if (kayit && !sirketErisimKontrol(kayit.catiFirmaId, req)) { res.status(403).json({ error: "Erişim yok" }); return; }

    const fp = path.join(UPLOAD_DIR, dosya.dosyaYolu);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await db.delete(servisDosyalari).where(eq(servisDosyalari.id, id));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Dosya silinemedi" });
  }
});

export default router;
