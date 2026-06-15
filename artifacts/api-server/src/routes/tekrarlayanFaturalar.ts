import { Router } from "express";
import { db } from "@workspace/db";
import { tekrarlayanFaturalar, firmalar, gemiler, faturalar, faturaKalemleri, faturaSerileri } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";

const router = Router();

router.get("/tekrarlayan-faturalar", async (req, res) => {
  try {
    const { catiFirmaId } = req.query as Record<string, string>;

    const rows = await db
      .select({
        t: tekrarlayanFaturalar,
        catiFirmaAd: firmalar.ad,
        gemiAd: gemiler.ad,
      })
      .from(tekrarlayanFaturalar)
      .leftJoin(firmalar, eq(tekrarlayanFaturalar.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(tekrarlayanFaturalar.gemiId, gemiler.id))
      .orderBy(tekrarlayanFaturalar.sonrakiTarih);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, catiFirmaId: r.t.catiFirmaId })), req, catiFirmaId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    const filtered = rows.filter(r => scoped.some(s => s.t.id === r.t.id));

    const bagliAds = await bagliAdlariGetir();
    res.json(filtered.map(r => formatTekrarlayan(r.t, r.catiFirmaAd, bagliAds[r.t.bagliFirmaId] ?? null, r.gemiAd)));
  } catch {
    res.status(500).json({ error: "Tekrarlayan faturalar listelenemedi" });
  }
});

router.post("/tekrarlayan-faturalar", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, bagliFirmaId, gemiId, aciklama, birimFiyat, kdvOrani, paraBirimi, sonrakiTarih, aktif } = req.body;
    if (!catiFirmaId || !bagliFirmaId || !aciklama || !birimFiyat || !sonrakiTarih) {
      res.status(400).json({ error: "Zorunlu alanlar eksik" }); return;
    }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const [row] = await db.insert(tekrarlayanFaturalar).values({
      catiFirmaId, bagliFirmaId, gemiId: gemiId ?? null,
      aciklama, birimFiyat: String(birimFiyat),
      kdvOrani: String(kdvOrani ?? 0),
      paraBirimi: paraBirimi ?? "USD",
      sonrakiTarih, aktif: aktif ?? true,
    }).returning();

    const bagliAds = await bagliAdlariGetir();
    res.status(201).json(formatTekrarlayan(row, null, bagliAds[row.bagliFirmaId] ?? null, null));
  } catch {
    res.status(500).json({ error: "Tekrarlayan fatura oluşturulamadı" });
  }
});

router.patch("/tekrarlayan-faturalar/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(tekrarlayanFaturalar).where(eq(tekrarlayanFaturalar.id, id));
    if (!existing) { res.status(404).json({ error: "Tekrarlayan fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const { bagliFirmaId, gemiId, aciklama, birimFiyat, kdvOrani, paraBirimi, sonrakiTarih, aktif } = req.body;
    const [row] = await db.update(tekrarlayanFaturalar)
      .set({
        bagliFirmaId, gemiId: gemiId ?? null, aciklama,
        birimFiyat: birimFiyat ? String(birimFiyat) : undefined,
        kdvOrani: kdvOrani !== undefined ? String(kdvOrani) : undefined,
        paraBirimi, sonrakiTarih, aktif,
      })
      .where(eq(tekrarlayanFaturalar.id, id))
      .returning();

    const bagliAds = await bagliAdlariGetir();
    res.json(formatTekrarlayan(row, null, bagliAds[row.bagliFirmaId] ?? null, null));
  } catch {
    res.status(500).json({ error: "Tekrarlayan fatura güncellenemedi" });
  }
});

router.delete("/tekrarlayan-faturalar/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(tekrarlayanFaturalar).where(eq(tekrarlayanFaturalar.id, id));
    if (!existing) { res.status(404).json({ error: "Tekrarlayan fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    await db.delete(tekrarlayanFaturalar).where(eq(tekrarlayanFaturalar.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Tekrarlayan fatura silinemedi" });
  }
});

router.post("/tekrarlayan-faturalar/:id/uret", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [tr] = await db.select().from(tekrarlayanFaturalar).where(eq(tekrarlayanFaturalar.id, id));
    if (!tr) { res.status(404).json({ error: "Tekrarlayan fatura bulunamadı" }); return; }
    if (!sirketErisimKontrol(tr.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }

    const [catiFirma] = await db.select().from(firmalar).where(eq(firmalar.id, tr.catiFirmaId));
    const prefix = catiFirma?.seriOneki ?? "FAT";
    const [count] = await db.select({ n: sql<number>`count(*)` }).from(faturalar).where(eq(faturalar.catiFirmaId, tr.catiFirmaId));
    const faturaNo = `${prefix}${String((Number(count?.n ?? 0) + 1)).padStart(6, "0")}`;

    const ara = Number(tr.birimFiyat);
    const kdv = ara * (Number(tr.kdvOrani) / 100);
    const genelToplam = ara + kdv;

    const faturaTarihi = tr.sonrakiTarih;
    const vadeDate = new Date(tr.sonrakiTarih);
    vadeDate.setDate(vadeDate.getDate() + 30);
    const vadeTarihi = vadeDate.toISOString().split("T")[0];

    const [fatura] = await db.insert(faturalar).values({
      catiFirmaId: tr.catiFirmaId,
      bagliFirmaId: tr.bagliFirmaId,
      gemiId: tr.gemiId,
      faturaNo, faturaTarihi, vadeTarihi,
      paraBirimi: tr.paraBirimi,
      durum: "acik",
      toplamTutar: String(ara),
      kdvTutari: String(kdv),
      genelToplam: String(genelToplam),
      aciklama: tr.aciklama,
    }).returning();

    await db.insert(faturaKalemleri).values({
      faturaId: fatura.id,
      aciklama: tr.aciklama,
      miktar: "1",
      birimFiyat: String(ara),
      kdvOrani: String(tr.kdvOrani),
      araToplam: String(ara),
      kdvTutari: String(kdv),
      genelToplam: String(genelToplam),
    });

    const nextDate = new Date(tr.sonrakiTarih);
    nextDate.setMonth(nextDate.getMonth() + 1);
    await db.update(tekrarlayanFaturalar)
      .set({ sonrakiTarih: nextDate.toISOString().split("T")[0] })
      .where(eq(tekrarlayanFaturalar.id, id));

    res.status(201).json({
      id: fatura.id, catiFirmaId: fatura.catiFirmaId, catiFirmaAd: null,
      bagliFirmaId: fatura.bagliFirmaId, bagliFirmaAd: null,
      gemiId: fatura.gemiId, gemiAd: null,
      faturaNo: fatura.faturaNo, faturaTarihi: fatura.faturaTarihi, vadeTarihi: fatura.vadeTarihi,
      paraBirimi: fatura.paraBirimi, durum: fatura.durum,
      toplamTutar: Number(fatura.toplamTutar),
      kdvTutari: Number(fatura.kdvTutari),
      genelToplam: Number(fatura.genelToplam),
      odenenTutar: 0, kalanTutar: Number(fatura.genelToplam),
      notlar: fatura.notlar, aciklama: fatura.aciklama,
      olusturmaTarihi: fatura.olusturmaTarihi,
    });
  } catch {
    res.status(500).json({ error: "Fatura üretilemedi" });
  }
});

async function bagliAdlariGetir(): Promise<Record<number, string>> {
  const rows = await db.select({ id: firmalar.id, ad: firmalar.ad }).from(firmalar);
  return Object.fromEntries(rows.map(r => [r.id, r.ad]));
}

function formatTekrarlayan(
  t: typeof tekrarlayanFaturalar.$inferSelect,
  catiFirmaAd: string | null | undefined,
  bagliFirmaAd: string | null | undefined,
  gemiAd: string | null | undefined,
) {
  return {
    id: t.id,
    catiFirmaId: t.catiFirmaId,
    catiFirmaAd: catiFirmaAd ?? null,
    bagliFirmaId: t.bagliFirmaId,
    bagliFirmaAd: bagliFirmaAd ?? null,
    gemiId: t.gemiId,
    gemiAd: gemiAd ?? null,
    aciklama: t.aciklama,
    birimFiyat: Number(t.birimFiyat),
    kdvOrani: Number(t.kdvOrani),
    paraBirimi: t.paraBirimi,
    sonrakiTarih: t.sonrakiTarih,
    aktif: t.aktif,
    olusturmaTarihi: t.olusturmaTarihi,
  };
}

export default router;
