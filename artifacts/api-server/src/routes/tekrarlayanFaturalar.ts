import { Router } from "express";
import { db } from "@workspace/db";
import { tekrarlayanFaturalar, tekrarlayanFaturaKalemleri, firmalar, gemiler } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";
import { tekrarlayandanFaturaUret } from "../lib/otomatikFaturaUret";

const router = Router();

type KalemInput = { aciklama: string; miktar: number; birimFiyat: number; kdvOrani: number };

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
    const kalemlerMap = await kalemleriGetir(filtered.map(r => r.t.id));
    res.json(filtered.map(r => formatTekrarlayan(r.t, r.catiFirmaAd, bagliAds[r.t.bagliFirmaId] ?? null, r.t.grupFirmaId ? bagliAds[r.t.grupFirmaId] ?? null : null, r.gemiAd, kalemlerMap[r.t.id] ?? [])));
  } catch {
    res.status(500).json({ error: "Tekrarlayan faturalar listelenemedi" });
  }
});

router.post("/tekrarlayan-faturalar", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, bagliFirmaId, grupFirmaId, gemiId, aciklama, birimFiyat, kdvOrani, paraBirimi, sonrakiTarih, aktif, kalemler } = req.body;
    if (!catiFirmaId || !bagliFirmaId || !aciklama || !birimFiyat || !sonrakiTarih) {
      res.status(400).json({ error: "Zorunlu alanlar eksik" }); return;
    }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }

    const [row] = await db.insert(tekrarlayanFaturalar).values({
      catiFirmaId, bagliFirmaId, grupFirmaId: grupFirmaId ? Number(grupFirmaId) : null, gemiId: gemiId ?? null,
      aciklama, birimFiyat: String(birimFiyat),
      kdvOrani: String(kdvOrani ?? 0),
      paraBirimi: paraBirimi ?? "USD",
      sonrakiTarih, aktif: aktif ?? true,
    }).returning();

    await kalemleriKaydet(row.id, kalemler as KalemInput[] | undefined);

    const bagliAds = await bagliAdlariGetir();
    const kalemRows = await kalemleriGetir([row.id]);
    res.status(201).json(formatTekrarlayan(row, null, bagliAds[row.bagliFirmaId] ?? null, row.grupFirmaId ? bagliAds[row.grupFirmaId] ?? null : null, null, kalemRows[row.id] ?? []));
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

    const { bagliFirmaId, grupFirmaId, gemiId, aciklama, birimFiyat, kdvOrani, paraBirimi, sonrakiTarih, aktif, kalemler } = req.body;
    const [row] = await db.update(tekrarlayanFaturalar)
      .set({
        bagliFirmaId, grupFirmaId: grupFirmaId === undefined ? undefined : (grupFirmaId === null ? null : Number(grupFirmaId)),
        gemiId: gemiId ?? null, aciklama,
        birimFiyat: birimFiyat ? String(birimFiyat) : undefined,
        kdvOrani: kdvOrani !== undefined ? String(kdvOrani) : undefined,
        paraBirimi, sonrakiTarih, aktif,
      })
      .where(eq(tekrarlayanFaturalar.id, id))
      .returning();

    if (kalemler !== undefined) {
      await db.delete(tekrarlayanFaturaKalemleri).where(eq(tekrarlayanFaturaKalemleri.tekrarlayanFaturaId, id));
      await kalemleriKaydet(id, kalemler as KalemInput[] | undefined);
    }

    const bagliAds = await bagliAdlariGetir();
    const kalemRows = await kalemleriGetir([id]);
    res.json(formatTekrarlayan(row, null, bagliAds[row.bagliFirmaId] ?? null, row.grupFirmaId ? bagliAds[row.grupFirmaId] ?? null : null, null, kalemRows[id] ?? []));
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

    const fatura = await tekrarlayandanFaturaUret(tr);

    res.status(201).json({
      id: fatura.id, catiFirmaId: fatura.catiFirmaId, catiFirmaAd: null,
      bagliFirmaId: fatura.bagliFirmaId, bagliFirmaAd: null,
      grupFirmaId: fatura.grupFirmaId, grupFirmaAd: null,
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

async function kalemleriGetir(ids: number[]): Promise<Record<number, typeof tekrarlayanFaturaKalemleri.$inferSelect[]>> {
  if (!ids.length) return {};
  const rows = await db.select().from(tekrarlayanFaturaKalemleri).where(inArray(tekrarlayanFaturaKalemleri.tekrarlayanFaturaId, ids));
  const map: Record<number, typeof tekrarlayanFaturaKalemleri.$inferSelect[]> = {};
  for (const r of rows) {
    (map[r.tekrarlayanFaturaId] ??= []).push(r);
  }
  return map;
}

async function kalemleriKaydet(tekrarlayanFaturaId: number, kalemler: KalemInput[] | undefined): Promise<void> {
  if (!kalemler?.length) return;
  for (const k of kalemler) {
    await db.insert(tekrarlayanFaturaKalemleri).values({
      tekrarlayanFaturaId,
      aciklama: k.aciklama,
      miktar: String(k.miktar ?? 1),
      birimFiyat: String(k.birimFiyat),
      kdvOrani: String(k.kdvOrani ?? 0),
    });
  }
}

function formatTekrarlayan(
  t: typeof tekrarlayanFaturalar.$inferSelect,
  catiFirmaAd: string | null | undefined,
  bagliFirmaAd: string | null | undefined,
  grupFirmaAd: string | null | undefined,
  gemiAd: string | null | undefined,
  kalemler: typeof tekrarlayanFaturaKalemleri.$inferSelect[] = [],
) {
  return {
    id: t.id,
    catiFirmaId: t.catiFirmaId,
    catiFirmaAd: catiFirmaAd ?? null,
    bagliFirmaId: t.bagliFirmaId,
    bagliFirmaAd: bagliFirmaAd ?? null,
    grupFirmaId: t.grupFirmaId,
    grupFirmaAd: grupFirmaAd ?? null,
    gemiId: t.gemiId,
    gemiAd: gemiAd ?? null,
    aciklama: t.aciklama,
    birimFiyat: Number(t.birimFiyat),
    kdvOrani: Number(t.kdvOrani),
    paraBirimi: t.paraBirimi,
    sonrakiTarih: t.sonrakiTarih,
    aktif: t.aktif,
    kalemler: kalemler.map(k => ({
      id: k.id,
      tekrarlayanFaturaId: k.tekrarlayanFaturaId,
      aciklama: k.aciklama,
      miktar: Number(k.miktar),
      birimFiyat: Number(k.birimFiyat),
      kdvOrani: Number(k.kdvOrani),
    })),
    olusturmaTarihi: t.olusturmaTarihi,
  };
}

export default router;
