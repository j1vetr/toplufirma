import { Router } from "express";
import { db } from "@workspace/db";
import { firmalar, firmaEpostaAyarlari, faturalar, odemeler } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireYazma, requireYonetici, sirketErisimKontrol } from "../middleware/auth";

const router = Router();

router.get("/firmalar", async (req, res) => {
  try {
    const { tip, ustFirmaId } = req.query as Record<string, string>;

    const rows = await db.select().from(firmalar).orderBy(firmalar.ad);

    let filtered = rows;
    if (req.kullanici?.rol !== "yonetici") {
      const izinli = req.izinliSirketler ?? [];
      filtered = rows.filter(f => {
        if (f.tip === "cati") return izinli.includes(f.id);
        return f.ustFirmaId != null && izinli.includes(f.ustFirmaId);
      });
    }
    if (tip) filtered = filtered.filter(f => f.tip === tip);
    if (ustFirmaId) filtered = filtered.filter(f => f.ustFirmaId === Number(ustFirmaId));

    res.json(filtered.map(formatFirma));
  } catch {
    res.status(500).json({ error: "Firmalar listelenemedi" });
  }
});

router.post("/firmalar", requireYazma, async (req, res) => {
  try {
    const {
      tip, ustFirmaId, ad, vergiNo, vergiDairesi, adres, telefon, eposta,
      yetkiliKisi, paraBirimi, notlar, seriOneki, logo, aktif,
    } = req.body;
    if (!tip || !ad) { res.status(400).json({ error: "tip ve ad zorunludur" }); return; }

    if (tip === "bagli") {
      if (!ustFirmaId) { res.status(400).json({ error: "Bağlı firma için ustFirmaId zorunludur" }); return; }
      if (!sirketErisimKontrol(Number(ustFirmaId), req)) { res.status(403).json({ error: "Bu çatı firmaya erişim izniniz yok" }); return; }
      const [catiFirma] = await db.select().from(firmalar).where(eq(firmalar.id, Number(ustFirmaId)));
      if (!catiFirma || catiFirma.tip !== "cati") { res.status(400).json({ error: "ustFirmaId geçerli bir çatı firma değil" }); return; }
    } else {
      if (req.kullanici?.rol !== "yonetici") { res.status(403).json({ error: "Çatı firma oluşturmak için yönetici yetkisi gerekli" }); return; }
    }

    const [row] = await db.insert(firmalar).values({
      tip, ustFirmaId: ustFirmaId ?? null, ad, vergiNo, vergiDairesi, adres, telefon,
      eposta, yetkiliKisi, paraBirimi: paraBirimi ?? "USD", notlar,
      seriOneki, logo, aktif: aktif ?? true,
    }).returning();
    res.status(201).json(formatFirma(row));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique")) { res.status(409).json({ error: "Bu bilgilere sahip bir firma zaten mevcut" }); return; }
    res.status(500).json({ error: "Firma oluşturulamadı" });
  }
});

router.get("/firmalar/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }

    const catiFirmaId = firma.tip === "cati" ? firma.id : firma.ustFirmaId;
    if (catiFirmaId && !sirketErisimKontrol(catiFirmaId, req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    let baglilar: ReturnType<typeof formatFirma>[] = [];
    if (firma.tip === "cati") {
      const b = await db.select().from(firmalar).where(and(eq(firmalar.ustFirmaId, id), eq(firmalar.aktif, true)));
      baglilar = b.map(formatFirma);
    }

    res.json({ ...formatFirma(firma), baglilar });
  } catch {
    res.status(500).json({ error: "Firma getirilemedi" });
  }
});

router.patch("/firmalar/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!existing) { res.status(404).json({ error: "Firma bulunamadı" }); return; }

    const catiFirmaId = existing.tip === "cati" ? existing.id : existing.ustFirmaId;
    if (catiFirmaId && !sirketErisimKontrol(catiFirmaId, req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const { ad, vergiNo, vergiDairesi, adres, telefon, eposta, yetkiliKisi, paraBirimi, notlar, seriOneki, logo, aktif } = req.body;
    const [row] = await db.update(firmalar)
      .set({ ad, vergiNo, vergiDairesi, adres, telefon, eposta, yetkiliKisi, paraBirimi, notlar, seriOneki, logo, aktif })
      .where(eq(firmalar.id, id)).returning();
    res.json(formatFirma(row));
  } catch {
    res.status(500).json({ error: "Firma güncellenemedi" });
  }
});

router.delete("/firmalar/:id", requireYonetici, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!existing) { res.status(404).json({ error: "Firma bulunamadı" }); return; }

    const bagliSayisi = (await db.select().from(firmalar).where(eq(firmalar.ustFirmaId, id))).length;
    if (bagliSayisi > 0) { res.status(409).json({ error: "Bu firmaya bağlı alt firmalar var. Önce onları silin." }); return; }

    await db.delete(firmalar).where(eq(firmalar.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Firma silinemedi" });
  }
});

router.get("/firmalar/:id/ekstre", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }
    if (firma.tip !== "bagli") { res.status(400).json({ error: "Ekstre yalnızca bağlı firmalar için mevcuttur" }); return; }

    const catiFirmaId = firma.ustFirmaId!;
    if (!sirketErisimKontrol(catiFirmaId, req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const faturalarRows = await db.select().from(faturalar)
      .where(and(eq(faturalar.catiFirmaId, catiFirmaId), eq(faturalar.bagliFirmaId, id)));
    const odemelerRows = await db.select().from(odemeler)
      .where(and(eq(odemeler.catiFirmaId, catiFirmaId), eq(odemeler.bagliFirmaId, id)));

    const toplamBorc = faturalarRows.reduce((s, f) => s + Number(f.genelToplam), 0);
    const toplamOdenen = odemelerRows.filter(o => o.tip === "tahsilat").reduce((s, o) => s + Number(o.tutar), 0);
    const netBakiye = toplamBorc - toplamOdenen;

    const paraBirimleri = new Set([...faturalarRows.map(f => f.paraBirimi), ...odemelerRows.map(o => o.paraBirimi)]);
    const paraBirimiOzetleri = Array.from(paraBirimleri).map(pb => {
      const fatPb = faturalarRows.filter(f => f.paraBirimi === pb);
      const odPb = odemelerRows.filter(o => o.paraBirimi === pb && o.tip === "tahsilat");
      const borc = fatPb.reduce((s, f) => s + Number(f.genelToplam), 0);
      const odenen = odPb.reduce((s, o) => s + Number(o.tutar), 0);
      return { paraBirimi: pb, toplamBorc: borc, toplamOdenen: odenen, netBakiye: borc - odenen };
    });

    res.json({
      firmaId: id, firmaAd: firma.ad, catiFirmaId,
      toplamBorc, toplamOdenen, netBakiye,
      paraBirimiOzetleri,
      faturalar: faturalarRows.map(f => ({
        id: f.id, faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi,
        vadeTarihi: f.vadeTarihi, paraBirimi: f.paraBirimi, durum: f.durum,
        genelToplam: Number(f.genelToplam), aciklama: f.aciklama,
      })),
      odemeler: odemelerRows.map(o => ({
        id: o.id, tip: o.tip, tarih: o.tarih, tutar: Number(o.tutar),
        paraBirimi: o.paraBirimi, odemeYontemi: o.odemeYontemi, aciklama: o.aciklama,
      })),
    });
  } catch {
    res.status(500).json({ error: "Ekstre getirilemedi" });
  }
});

router.get("/firmalar/:id/eposta-ayarlari", requireYonetici, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }
    if (firma.tip !== "cati") { res.status(400).json({ error: "E-posta ayarları yalnızca çatı firmalar için mevcuttur" }); return; }

    const [ayarlar] = await db.select().from(firmaEpostaAyarlari).where(eq(firmaEpostaAyarlari.firmaId, id));
    if (!ayarlar) { res.json(null); return; }
    res.json({ ...ayarlar, smtpSifre: ayarlar.smtpSifre ? "••••••••" : null });
  } catch {
    res.status(500).json({ error: "E-posta ayarları getirilemedi" });
  }
});

router.put("/firmalar/:id/eposta-ayarlari", requireYonetici, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, id));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }
    if (firma.tip !== "cati") { res.status(400).json({ error: "E-posta ayarları yalnızca çatı firmalar için mevcuttur" }); return; }

    const { smtpHost, smtpPort, smtpGuvenlik, smtpKullanici, smtpSifre, gonderenAd, gonderenAdres, aktif } = req.body;
    const [existing] = await db.select().from(firmaEpostaAyarlari).where(eq(firmaEpostaAyarlari.firmaId, id));

    const sifreDegistirildi = smtpSifre && smtpSifre !== "••••••••";
    if (!existing && !sifreDegistirildi) { res.status(400).json({ error: "Yeni kayıt için SMTP şifresi zorunludur" }); return; }

    const vals = {
      smtpHost, smtpPort: smtpPort ?? 587, smtpGuvenlik: smtpGuvenlik ?? "starttls",
      smtpKullanici, gonderenAd, gonderenAdres, aktif: aktif ?? true,
      ...(sifreDegistirildi ? { smtpSifre } : {}),
    };

    let row;
    if (existing) {
      [row] = await db.update(firmaEpostaAyarlari).set(vals).where(eq(firmaEpostaAyarlari.firmaId, id)).returning();
    } else {
      [row] = await db.insert(firmaEpostaAyarlari).values({ firmaId: id, smtpSifre, ...vals }).returning();
    }
    res.json({ ...row, smtpSifre: row.smtpSifre ? "••••••••" : null });
  } catch {
    res.status(500).json({ error: "E-posta ayarları kaydedilemedi" });
  }
});

function formatFirma(f: typeof firmalar.$inferSelect) {
  return {
    id: f.id, tip: f.tip, ustFirmaId: f.ustFirmaId,
    ad: f.ad, vergiNo: f.vergiNo, vergiDairesi: f.vergiDairesi,
    adres: f.adres, telefon: f.telefon, eposta: f.eposta,
    yetkiliKisi: f.yetkiliKisi, paraBirimi: f.paraBirimi,
    notlar: f.notlar, seriOneki: f.seriOneki, logo: f.logo,
    aktif: f.aktif, olusturmaTarihi: f.olusturmaTarihi,
  };
}

export default router;
