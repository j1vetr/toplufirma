import { Router } from "express";
import { db } from "@workspace/db";
import { gemiler, cariler, faturalar, starlinkPlanlari, ekipmanlar } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/gemiler", async (req, res) => {
  try {
    const { cariId, sirketId } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof eq>[] = [];
    if (cariId) conditions.push(eq(gemiler.cariId, Number(cariId)));

    const rows = await db
      .select({ g: gemiler, cariAd: cariler.ad, cariSirketId: cariler.sirketId })
      .from(gemiler)
      .leftJoin(cariler, eq(gemiler.cariId, cariler.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(gemiler.ad);

    let filtered = rows;
    if (sirketId) {
      filtered = rows.filter(r => r.cariSirketId === Number(sirketId));
    }

    const aktifPlanlar = await db.select().from(starlinkPlanlari).where(eq(starlinkPlanlari.aktif, true));
    const planByGemi: Record<number, string> = {};
    for (const p of aktifPlanlar) planByGemi[p.gemiId] = p.planAdi;

    res.json(filtered.map(r => ({
      id: r.g.id,
      cariId: r.g.cariId,
      cariAd: r.cariAd ?? null,
      ad: r.g.ad,
      imoNumarasi: r.g.imoNumarasi,
      bayrakDevleti: r.g.bayrakDevleti,
      notlar: r.g.notlar,
      aktif: r.g.aktif,
      aktifPlan: planByGemi[r.g.id] ?? null,
      olusturmaTarihi: r.g.olusturmaTarihi,
    })));
  } catch (err) {
    res.status(500).json({ error: "Gemiler listelenemedi" });
  }
});

router.post("/gemiler", async (req, res) => {
  try {
    const { cariId, ad, imoNumarasi, bayrakDevleti, notlar, aktif } = req.body;
    if (!cariId || !ad) return res.status(400).json({ error: "cariId ve ad zorunludur" });
    const [row] = await db.insert(gemiler).values({
      cariId, ad, imoNumarasi, bayrakDevleti, notlar, aktif: aktif ?? true,
    }).returning();
    res.status(201).json({ ...row, cariAd: null, aktifPlan: null });
  } catch (err) {
    res.status(500).json({ error: "Gemi oluşturulamadı" });
  }
});

router.get("/gemiler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ g: gemiler, cariAd: cariler.ad })
      .from(gemiler)
      .leftJoin(cariler, eq(gemiler.cariId, cariler.id))
      .where(eq(gemiler.id, id));
    if (!row) return res.status(404).json({ error: "Gemi bulunamadı" });

    const plans = await db.select().from(starlinkPlanlari).where(eq(starlinkPlanlari.gemiId, id));
    const ekips = await db.select().from(ekipmanlar).where(eq(ekipmanlar.gemiId, id));
    const fats = await db.select().from(faturalar).where(eq(faturalar.gemiId, id));

    res.json({
      id: row.g.id,
      cariId: row.g.cariId,
      cariAd: row.cariAd ?? null,
      ad: row.g.ad,
      imoNumarasi: row.g.imoNumarasi,
      bayrakDevleti: row.g.bayrakDevleti,
      notlar: row.g.notlar,
      aktif: row.g.aktif,
      olusturmaTarihi: row.g.olusturmaTarihi,
      starlinkPlanlari: plans.map(p => formatPlan(p)),
      ekipmanlar: ekips.map(e => ({ ...e })),
      faturalar: fats.map(f => ({
        id: f.id, faturaNo: f.faturaNo, faturaTarihi: f.faturaTarihi,
        vadeTarihi: f.vadeTarihi, paraBirimi: f.paraBirimi, durum: f.durum,
        genelToplam: Number(f.genelToplam), toplamTutar: Number(f.toplamTutar),
        kdvTutari: Number(f.kdvTutari), odenenTutar: 0, kalanTutar: Number(f.genelToplam),
        sirketId: f.sirketId, cariId: f.cariId, gemiId: f.gemiId,
        notlar: f.notlar, aciklama: f.aciklama, olusturmaTarihi: f.olusturmaTarihi,
        sirketAd: null, cariAd: null, gemiAd: null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Gemi getirilemedi" });
  }
});

router.patch("/gemiler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { ad, imoNumarasi, bayrakDevleti, notlar, aktif, cariId } = req.body;
    const [row] = await db.update(gemiler)
      .set({ ad, imoNumarasi, bayrakDevleti, notlar, aktif, cariId })
      .where(eq(gemiler.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Gemi bulunamadı" });
    res.json({ ...row, cariAd: null, aktifPlan: null });
  } catch (err) {
    res.status(500).json({ error: "Gemi güncellenemedi" });
  }
});

router.delete("/gemiler/:id", async (req, res) => {
  try {
    await db.delete(gemiler).where(eq(gemiler.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Gemi silinemedi" });
  }
});

function formatPlan(p: typeof starlinkPlanlari.$inferSelect) {
  const today = new Date();
  const bitis = new Date(p.bitisTarihi);
  const kalanGun = Math.ceil((bitis.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return {
    id: p.id, sirketId: p.sirketId, cariId: p.cariId, gemiId: p.gemiId,
    planAdi: p.planAdi, hizMbps: p.hizMbps,
    baslangicTarihi: p.baslangicTarihi, bitisTarihi: p.bitisTarihi,
    aylikUcret: Number(p.aylikUcret), paraBirimi: p.paraBirimi,
    otomatikYenileme: p.otomatikYenileme, aktif: p.aktif,
    notlar: p.notlar, kalanGun,
    olusturmaTarihi: p.olusturmaTarihi,
    sirketAd: null, cariAd: null, gemiAd: null,
  };
}

export default router;
