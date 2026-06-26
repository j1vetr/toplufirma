import { Router } from "express";
import { db } from "@workspace/db";
import { gemiler, firmalar, faturalar, ekipmanlar, firmaSirketGorunurluk } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, firmaYazmaDenetimi } from "../middleware/auth";

const router = Router();

/**
 * Verilen catiFirmaId'ye görünür olan tüm bagli firma ID'lerini döner.
 * Bir bagli firma şu durumlarda görünür:
 *   1. bagli.ustFirmaId === catiFirmaId (doğrudan atanmış)
 *   2. bagli.grupFirmaId → o grup firmanın görünürlüğü catiFirmaId'yi kapsıyor
 *      (firmaSirketGorunurluk'ta kayıt varsa o listede, kayıt yoksa = herkese görünür)
 */
async function gorunurBagliFirmaIds(catiFirmaIdNum: number): Promise<number[]> {
  const tumFirmalar = await db.select().from(firmalar);
  const gorunurlukRows = await db.select().from(firmaSirketGorunurluk);

  const gorunurlukMap = new Map<number, number[]>();
  for (const g of gorunurlukRows) {
    if (!gorunurlukMap.has(g.firmaId)) gorunurlukMap.set(g.firmaId, []);
    gorunurlukMap.get(g.firmaId)!.push(g.catiFirmaId);
  }

  const gorunurGrupIds = new Set<number>();
  for (const f of tumFirmalar) {
    if (f.tip !== "grup") continue;
    const gorunur = gorunurlukMap.get(f.id);
    if (!gorunur || gorunur.length === 0) {
      gorunurGrupIds.add(f.id);
    } else if (gorunur.includes(catiFirmaIdNum)) {
      gorunurGrupIds.add(f.id);
    }
  }

  const ids: number[] = [];
  for (const f of tumFirmalar) {
    if (f.tip !== "bagli") continue;
    if (f.ustFirmaId === catiFirmaIdNum) { ids.push(f.id); continue; }
    if (f.grupFirmaId != null && gorunurGrupIds.has(f.grupFirmaId)) ids.push(f.id);
  }
  return ids;
}

router.get("/gemiler", async (req, res) => {
  try {
    const { firmaId, catiFirmaId } = req.query as Record<string, string>;

    const rows = await db
      .select({ g: gemiler, firmaAd: firmalar.ad, ustFirmaId: firmalar.ustFirmaId, grupFirmaId: firmalar.grupFirmaId })
      .from(gemiler)
      .leftJoin(firmalar, eq(gemiler.firmaId, firmalar.id))
      .orderBy(gemiler.ad);

    let filtered = rows;

    if (catiFirmaId) {
      const catiFirmaIdNum = Number(catiFirmaId);
      if (!sirketErisimKontrol(catiFirmaIdNum, req)) {
        res.status(403).json({ error: "Bu firmaya erişim izniniz yok" });
        return;
      }
      const izinliBagliFirmaIds = await gorunurBagliFirmaIds(catiFirmaIdNum);
      const idSet = new Set(izinliBagliFirmaIds);
      filtered = rows.filter(r => idSet.has(r.g.firmaId));
    } else if (req.kullanici?.rol !== "yonetici") {
      const izinli = req.izinliSirketler ?? [];
      const tumIds: number[] = [];
      for (const cid of izinli) {
        const ids = await gorunurBagliFirmaIds(cid);
        tumIds.push(...ids);
      }
      const idSet = new Set(tumIds);
      filtered = rows.filter(r => idSet.has(r.g.firmaId));
    }

    if (firmaId) filtered = filtered.filter(r => r.g.firmaId === Number(firmaId));

    res.json(filtered.map(r => ({
      id: r.g.id, firmaId: r.g.firmaId, firmaAd: r.firmaAd ?? null,
      catiFirmaId: r.ustFirmaId ?? null,
      ad: r.g.ad, imoNumarasi: r.g.imoNumarasi, bayrakDevleti: r.g.bayrakDevleti,
      notlar: r.g.notlar, aktif: r.g.aktif, olusturmaTarihi: r.g.olusturmaTarihi,
    })));
  } catch {
    res.status(500).json({ error: "Gemiler listelenemedi" });
  }
});

router.post("/gemiler", requireYazma, async (req, res) => {
  try {
    const { firmaId, ad, imoNumarasi, bayrakDevleti, notlar, aktif } = req.body;
    if (!firmaId || !ad) { res.status(400).json({ error: "firmaId ve ad zorunludur" }); return; }

    const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, Number(firmaId)));
    if (!firma) { res.status(404).json({ error: "Firma bulunamadı" }); return; }
    if (firma.tip !== "bagli") { res.status(400).json({ error: "Gemi yalnızca bağlı firmaya eklenebilir" }); return; }
    if (firma.ustFirmaId && !sirketErisimKontrol(firma.ustFirmaId!, req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    if (firma.ustFirmaId && !firmaYazmaDenetimi(firma.ustFirmaId!, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const [row] = await db.insert(gemiler).values({
      firmaId, ad, imoNumarasi, bayrakDevleti, notlar, aktif: aktif ?? true,
    }).returning();
    res.status(201).json({ ...row, firmaAd: null, catiFirmaId: firma.ustFirmaId });
  } catch {
    res.status(500).json({ error: "Gemi oluşturulamadı" });
  }
});

router.get("/gemiler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ g: gemiler, firmaAd: firmalar.ad, ustFirmaId: firmalar.ustFirmaId })
      .from(gemiler)
      .leftJoin(firmalar, eq(gemiler.firmaId, firmalar.id))
      .where(eq(gemiler.id, id));
    if (!row) { res.status(404).json({ error: "Gemi bulunamadı" }); return; }
    if (row.ustFirmaId && !sirketErisimKontrol(row.ustFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const ekips = await db.select().from(ekipmanlar).where(eq(ekipmanlar.gemiId, id));
    const fats = await db.select().from(faturalar).where(eq(faturalar.gemiId, id));

    res.json({
      id: row.g.id, firmaId: row.g.firmaId, firmaAd: row.firmaAd ?? null,
      catiFirmaId: row.ustFirmaId ?? null,
      ad: row.g.ad, imoNumarasi: row.g.imoNumarasi, bayrakDevleti: row.g.bayrakDevleti,
      notlar: row.g.notlar, aktif: row.g.aktif, olusturmaTarihi: row.g.olusturmaTarihi,
      ekipmanlar: ekips.map(e => ({ ...e })),
      faturalar: fats.map(f => ({
        id: f.id, faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi,
        vadeTarihi: f.vadeTarihi, paraBirimi: f.paraBirimi, durum: f.durum,
        genelToplam: Number(f.genelToplam), toplamTutar: Number(f.toplamTutar),
        kdvTutari: Number(f.kdvTutari), odenenTutar: 0, kalanTutar: Number(f.genelToplam),
        catiFirmaId: f.catiFirmaId, bagliFirmaId: f.bagliFirmaId, gemiId: f.gemiId,
        notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
        catiFirmaAd: null, bagliFirmaAd: null, gemiAd: null,
      })),
    });
  } catch {
    res.status(500).json({ error: "Gemi getirilemedi" });
  }
});

router.patch("/gemiler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db
      .select({ g: gemiler, ustFirmaId: firmalar.ustFirmaId })
      .from(gemiler).leftJoin(firmalar, eq(gemiler.firmaId, firmalar.id))
      .where(eq(gemiler.id, id));
    if (!existing) { res.status(404).json({ error: "Gemi bulunamadı" }); return; }
    if (existing.ustFirmaId && !sirketErisimKontrol(existing.ustFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (existing.ustFirmaId && !firmaYazmaDenetimi(existing.ustFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const { ad, imoNumarasi, bayrakDevleti, notlar, aktif, firmaId } = req.body;
    if (firmaId !== undefined) {
      const [newFirma] = await db.select().from(firmalar).where(eq(firmalar.id, Number(firmaId)));
      if (!newFirma || newFirma.ustFirmaId !== existing.ustFirmaId) { res.status(400).json({ error: "Belirtilen firma bu çatı firmaya ait değil" }); return; }
    }
    const [row] = await db.update(gemiler)
      .set({ ad, imoNumarasi, bayrakDevleti, notlar, aktif, firmaId })
      .where(eq(gemiler.id, id)).returning();
    res.json({ ...row, firmaAd: null, catiFirmaId: existing.ustFirmaId });
  } catch {
    res.status(500).json({ error: "Gemi güncellenemedi" });
  }
});

router.delete("/gemiler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db
      .select({ g: gemiler, ustFirmaId: firmalar.ustFirmaId })
      .from(gemiler).leftJoin(firmalar, eq(gemiler.firmaId, firmalar.id))
      .where(eq(gemiler.id, id));
    if (!existing) { res.status(404).json({ error: "Gemi bulunamadı" }); return; }
    if (existing.ustFirmaId && !sirketErisimKontrol(existing.ustFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (existing.ustFirmaId && !firmaYazmaDenetimi(existing.ustFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
    try {
      await db.delete(gemiler).where(eq(gemiler.id, id));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("foreign key") || msg.includes("violates")) {
        res.status(400).json({ error: "Bu gemi fatura veya kayıtlarda kullanılıyor. Önce ilgili kayıtları silin." });
        return;
      }
      throw e;
    }
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Gemi silinemedi" });
  }
});

export default router;
