import { Router } from "express";
import { db } from "@workspace/db";
import { odemeler, firmalar, gemiler, bankaHesaplari, faturalar, firmaSirketGorunurluk } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele, firmaYazmaDenetimi } from "../middleware/auth";
import { gorunurBagliFirmaIds } from "../utils/gorunurluk";

const router = Router();

router.get("/odemeler", async (req, res) => {
  try {
    const { catiFirmaId, bagliFirmaId, faturaId, tip } = req.query as Record<string, string>;

    let rows = await db
      .select({ o: odemeler, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad, faturaNo: faturalar.faturaNo })
      .from(odemeler)
      .leftJoin(firmalar, eq(odemeler.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(odemeler.gemiId, gemiler.id))
      .leftJoin(faturalar, eq(odemeler.faturaId, faturalar.id))
      .orderBy(odemeler.tarih);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, catiFirmaId: r.o.catiFirmaId })), req, catiFirmaId
    );
    if (yetkisiz) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    rows = rows.filter(r => scoped.some(s => s.o.id === r.o.id));

    if (bagliFirmaId) rows = rows.filter(r => r.o.bagliFirmaId === Number(bagliFirmaId));
    if (faturaId) rows = rows.filter(r => r.o.faturaId === Number(faturaId));
    if (tip) rows = rows.filter(r => r.o.tip === tip);

    res.json(rows.map(r => formatOdeme(r.o, r.catiFirmaAd, r.gemiAd, null, r.faturaNo)));
  } catch {
    res.status(500).json({ error: "Ödemeler listelenemedi" });
  }
});

router.post("/odemeler", requireYazma, async (req, res) => {
  try {
    const { catiFirmaId, bagliFirmaId, gemiId, bankaHesabiId, faturaId, tip, tarih, tutar, paraBirimi, odemeYontemi, aciklama } = req.body;
    if (!catiFirmaId || !tip || !tarih || !tutar) {
      res.status(400).json({ error: "Zorunlu alanlar eksik" }); return;
    }
    if (!sirketErisimKontrol(Number(catiFirmaId), req)) { res.status(403).json({ error: "Bu firmaya erişim izniniz yok" }); return; }
    const tutarKurus = kurusaCevir(tutar);
    if (tutarKurus == null || tutarKurus <= 0) { res.status(400).json({ error: "Tutar sıfırdan büyük olmalı ve en fazla iki ondalık basamak içerebilir" }); return; }

    if (bagliFirmaId) {
      const [targetFirma] = await db.select({ tip: firmalar.tip }).from(firmalar).where(eq(firmalar.id, Number(bagliFirmaId)));
      if (!targetFirma) { res.status(400).json({ error: "Belirtilen firma bulunamadı" }); return; }
      if (targetFirma.tip === "grup") {
        const gorunurlukRows = await db.select().from(firmaSirketGorunurluk).where(eq(firmaSirketGorunurluk.firmaId, Number(bagliFirmaId)));
        const isVisible = gorunurlukRows.length === 0 || gorunurlukRows.some(g => g.catiFirmaId === Number(catiFirmaId));
        if (!isVisible) { res.status(400).json({ error: "Belirtilen grup firma bu çatı firmaya ait değil" }); return; }
      } else if (targetFirma.tip === "bagli") {
        const gorIds = await gorunurBagliFirmaIds(Number(catiFirmaId));
        if (!gorIds.includes(Number(bagliFirmaId))) { res.status(400).json({ error: "Belirtilen bağlı firma bu çatı firmaya ait değil" }); return; }
      } else {
        res.status(400).json({ error: "Belirtilen firma ödeme için geçersiz tipte" }); return;
      }
    }
    const odemePb: string = paraBirimi ?? "USD";
    if (bankaHesabiId) {
      const [bh] = await db.select({ cid: bankaHesaplari.catiFirmaId, paraBirimi: bankaHesaplari.paraBirimi, ibanlar: bankaHesaplari.ibanlar })
        .from(bankaHesaplari).where(eq(bankaHesaplari.id, Number(bankaHesabiId)));
      if (!bh || bh.cid !== Number(catiFirmaId)) { res.status(400).json({ error: "Belirtilen banka hesabı bu firmaya ait değil" }); return; }
      const hesapPbleri = hesapParaBirimleri(bh);
      if (!hesapPbleri.includes(odemePb)) {
        res.status(400).json({ error: `Seçilen banka hesabında ${odemePb} para birimi kayıtlı değil (hesaptaki para birimleri: ${hesapPbleri.join(", ")})` }); return;
      }
    }

    // Fatura doğrulaması + kayıt tek transaksiyonda: fatura satırı kilitlenir ki
    // eşzamanlı iki tahsilat aynı "kalan"ı görüp birlikte limit aşamasın.
    const sonuc = await db.transaction(async (tx) => {
      if (faturaId) {
        const [fat] = await tx.select().from(faturalar).where(eq(faturalar.id, Number(faturaId))).for("update");
        if (!fat || fat.catiFirmaId !== Number(catiFirmaId)) return { hata: "Belirtilen fatura bu firmaya ait değil" } as const;
        const hata = await faturaOdemeKuralHatasi(tx, fat, { tip, tutarKurus, paraBirimi: odemePb });
        if (hata) return { hata } as const;
      }
      const [row] = await tx.insert(odemeler).values({
        catiFirmaId, bagliFirmaId: bagliFirmaId ?? null, gemiId: gemiId ?? null,
        bankaHesabiId: bankaHesabiId ?? null,
        faturaId: faturaId ?? null, tip, tarih, tutar: String(tutar),
        paraBirimi: odemePb, odemeYontemi: odemeYontemi ?? "banka_havalesi", aciklama,
      }).returning();
      if (faturaId) await guncelleFaturaDurum(Number(faturaId), tx);
      return { row } as const;
    });
    if ("hata" in sonuc) { res.status(400).json({ error: sonuc.hata }); return; }
    res.status(201).json(formatOdeme(sonuc.row, null, null, null, null));
  } catch {
    res.status(500).json({ error: "Ödeme oluşturulamadı" });
  }
});

router.get("/odemeler/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ o: odemeler, catiFirmaAd: firmalar.ad, gemiAd: gemiler.ad, faturaNo: faturalar.faturaNo })
      .from(odemeler)
      .leftJoin(firmalar, eq(odemeler.catiFirmaId, firmalar.id))
      .leftJoin(gemiler, eq(odemeler.gemiId, gemiler.id))
      .leftJoin(faturalar, eq(odemeler.faturaId, faturalar.id))
      .where(eq(odemeler.id, id));
    if (!row) { res.status(404).json({ error: "Ödeme bulunamadı" }); return; }
    if (!sirketErisimKontrol(row.o.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    res.json(formatOdeme(row.o, row.catiFirmaAd, row.gemiAd, null, row.faturaNo));
  } catch {
    res.status(500).json({ error: "Ödeme getirilemedi" });
  }
});

router.patch("/odemeler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(odemeler).where(eq(odemeler.id, id));
    if (!existing) { res.status(404).json({ error: "Ödeme bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }

    const { tarih, tutar, aciklama, odemeYontemi, bankaHesabiId } = req.body;
    let yeniTutarKurus: number | null = null;
    if (tutar != null) {
      yeniTutarKurus = kurusaCevir(tutar);
      if (yeniTutarKurus == null || yeniTutarKurus <= 0) { res.status(400).json({ error: "Tutar sıfırdan büyük olmalı ve en fazla iki ondalık basamak içerebilir" }); return; }
    }
    if (bankaHesabiId != null) {
      const [bh] = await db.select({ cid: bankaHesaplari.catiFirmaId, paraBirimi: bankaHesaplari.paraBirimi, ibanlar: bankaHesaplari.ibanlar })
        .from(bankaHesaplari).where(eq(bankaHesaplari.id, Number(bankaHesabiId)));
      if (!bh || bh.cid !== existing.catiFirmaId) { res.status(400).json({ error: "Belirtilen banka hesabı bu firmaya ait değil" }); return; }
      const hesapPbleri = hesapParaBirimleri(bh);
      const odemePb = existing.paraBirimi ?? "USD";
      if (!hesapPbleri.includes(odemePb)) {
        res.status(400).json({ error: `Seçilen banka hesabında ${odemePb} para birimi kayıtlı değil (hesaptaki para birimleri: ${hesapPbleri.join(", ")})` }); return;
      }
    }
    const sonuc = await db.transaction(async (tx) => {
      if (existing.faturaId) {
        const [fat] = await tx.select().from(faturalar).where(eq(faturalar.id, existing.faturaId)).for("update");
        if (fat) {
          const hata = await faturaOdemeKuralHatasi(tx, fat, {
            tip: existing.tip,
            tutarKurus: yeniTutarKurus ?? Math.round(Number(existing.tutar) * 100),
            paraBirimi: existing.paraBirimi ?? "USD",
            haricOdemeId: id,
          });
          if (hata) return { hata } as const;
        }
      }
      const [row] = await tx.update(odemeler)
        .set({
          tarih, tutar: tutar != null ? String(tutar) : undefined, aciklama, odemeYontemi,
          // undefined = dokunma; null = bağlantıyı kaldır; sayı = yeni hesap
          bankaHesabiId: bankaHesabiId === undefined ? undefined : (bankaHesabiId === null ? null : Number(bankaHesabiId)),
        })
        .where(eq(odemeler.id, id)).returning();
      if (row.faturaId) await guncelleFaturaDurum(row.faturaId, tx);
      return { row } as const;
    });
    if ("hata" in sonuc) { res.status(400).json({ error: sonuc.hata }); return; }
    res.json(formatOdeme(sonuc.row, null, null, null, null));
  } catch {
    res.status(500).json({ error: "Ödeme güncellenemedi" });
  }
});

router.delete("/odemeler/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(odemeler).where(eq(odemeler.id, id));
    if (!existing) { res.status(404).json({ error: "Ödeme bulunamadı" }); return; }
    if (!sirketErisimKontrol(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
    if (!firmaYazmaDenetimi(existing.catiFirmaId, req)) { res.status(403).json({ error: "Bu firmada yazma yetkiniz yok" }); return; }
    await db.transaction(async (tx) => {
      if (existing.faturaId) {
        await tx.select({ id: faturalar.id }).from(faturalar).where(eq(faturalar.id, existing.faturaId)).for("update");
      }
      await tx.delete(odemeler).where(eq(odemeler.id, id));
      if (existing.faturaId) await guncelleFaturaDurum(existing.faturaId, tx);
    });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Ödeme silinemedi" });
  }
});

/** db veya bir transaksiyon içindeki tx — her ikisiyle de çalışan sorgu yürütücüsü. */
type DbVeyaTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function hesapParaBirimleri(bh: { paraBirimi: string | null; ibanlar: Record<string, string> | null }): string[] {
  return [...new Set([bh.paraBirimi, ...Object.keys(bh.ibanlar ?? {})].filter((p): p is string => !!p))];
}

/**
 * Parasal tutarı kuruş (minör birim, tam sayı) cinsine çevirir.
 * Sonlu olmayan veya ikiden fazla ondalık basamaklı değerler için null döner —
 * kayıt numeric(scale:2) olduğundan fazla hassasiyet sessiz yuvarlama yaratırdı.
 */
function kurusaCevir(t: unknown): number | null {
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const k = Math.round(n * 100);
  if (Math.abs(n * 100 - k) > 1e-6) return null;
  return k;
}

/**
 * Faturaya bağlı ödeme iş kuralları (create + update ortak).
 * Karşılaştırmalar kuruş (tam sayı) üzerinden yapılır — kayan nokta toleransı yok.
 * Fatura satırı çağıran tarafından FOR UPDATE ile kilitlenmiş olmalı.
 * Hata varsa Türkçe mesaj, yoksa null döner.
 */
async function faturaOdemeKuralHatasi(
  tx: DbVeyaTx,
  fat: typeof faturalar.$inferSelect,
  odeme: { tip: string; tutarKurus: number; paraBirimi: string; haricOdemeId?: number },
): Promise<string | null> {
  if (fat.durum === "taslak" || fat.durum === "iptal") {
    return fat.durum === "taslak"
      ? "Taslak faturaya ödeme kaydedilemez"
      : "İptal edilmiş faturaya ödeme kaydedilemez";
  }
  if (odeme.paraBirimi !== fat.paraBirimi) {
    return `Ödemenin para birimi (${odeme.paraBirimi}) fatura para birimiyle (${fat.paraBirimi}) eşleşmeli`;
  }
  if (odeme.tip === "tahsilat") {
    const ods = await tx.select().from(odemeler).where(eq(odemeler.faturaId, fat.id));
    const odenenKurus = ods
      .filter(o => o.tip === "tahsilat" && o.paraBirimi === fat.paraBirimi && o.id !== odeme.haricOdemeId)
      .reduce((s, o) => s + Math.round(Number(o.tutar) * 100), 0);
    const kalanKurus = Math.round(Number(fat.genelToplam) * 100) - odenenKurus;
    if (odeme.tutarKurus > kalanKurus) {
      return `Tahsilat tutarı faturanın kalan tutarını aşamaz (kalan: ${(Math.max(kalanKurus, 0) / 100).toFixed(2)} ${fat.paraBirimi})`;
    }
  }
  return null;
}

async function guncelleFaturaDurum(faturaId: number, tx: DbVeyaTx = db) {
  try {
    const [fatura] = await tx.select().from(faturalar).where(eq(faturalar.id, faturaId));
    if (!fatura) return;
    // Manuel taslak/iptal durumunu otomatik hesaplama asla ezmemeli.
    if (fatura.durum === "taslak" || fatura.durum === "iptal") return;
    const ods = await tx.select().from(odemeler).where(eq(odemeler.faturaId, faturaId));
    const odenenKurus = ods
      .filter(o => o.tip === "tahsilat" && o.paraBirimi === fatura.paraBirimi)
      .reduce((s, o) => s + Math.round(Number(o.tutar) * 100), 0);
    const genelKurus = Math.round(Number(fatura.genelToplam) * 100);
    let durum: typeof faturalar.$inferSelect["durum"] = "acik";
    if (odenenKurus >= genelKurus) durum = "odendi";
    else if (odenenKurus > 0) durum = "kismi_odendi";
    await tx.update(faturalar).set({ durum }).where(eq(faturalar.id, faturaId));
  } catch {}
}

function formatOdeme(
  o: typeof odemeler.$inferSelect,
  catiFirmaAd: string | null | undefined,
  gemiAd: string | null | undefined,
  bankaHesabiAd: string | null | undefined,
  faturaNo: string | null | undefined
) {
  return {
    id: o.id, catiFirmaId: o.catiFirmaId, catiFirmaAd: catiFirmaAd ?? null,
    bagliFirmaId: o.bagliFirmaId, gemiId: o.gemiId, gemiAd: gemiAd ?? null,
    bankaHesabiId: o.bankaHesabiId, bankaHesabiAd: bankaHesabiAd ?? null,
    faturaId: o.faturaId, faturaNo: faturaNo ?? null, tip: o.tip, tarih: o.tarih,
    tutar: Number(o.tutar), paraBirimi: o.paraBirimi, odemeYontemi: o.odemeYontemi,
    aciklama: o.aciklama, olusturmaTarihi: o.olusturmaTarihi,
  };
}

export default router;
