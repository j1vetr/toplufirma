import { Router } from "express";
import { db } from "@workspace/db";
import { bankaHesaplari, sirketler, odemeler } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

router.get("/banka-hesaplari", async (req, res) => {
  try {
    const { sirketId } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof eq>[] = [];
    if (sirketId) conditions.push(eq(bankaHesaplari.sirketId, Number(sirketId)));

    const rows = await db
      .select({ h: bankaHesaplari, sirketAd: sirketler.ad })
      .from(bankaHesaplari)
      .leftJoin(sirketler, eq(bankaHesaplari.sirketId, sirketler.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(bankaHesaplari.bankaAdi);

    const bakiyeler = await hesaplaHesapBakiyeleri();
    res.json(rows.map(r => formatHesap(r.h, r.sirketAd, bakiyeler[r.h.id] ?? 0)));
  } catch (err) {
    res.status(500).json({ error: "Banka hesapları listelenemedi" });
  }
});

router.post("/banka-hesaplari", async (req, res) => {
  try {
    const { sirketId, bankaAdi, hesapAdi, iban, paraBirimi, subeAdi, aciklama, aktif } = req.body;
    if (!sirketId || !bankaAdi || !hesapAdi) return res.status(400).json({ error: "sirketId, bankaAdi ve hesapAdi zorunludur" });
    const [row] = await db.insert(bankaHesaplari).values({
      sirketId, bankaAdi, hesapAdi, iban, paraBirimi: paraBirimi ?? "TRY",
      subeAdi, aciklama, aktif: aktif ?? true,
    }).returning();
    res.status(201).json(formatHesap(row, null, 0));
  } catch (err) {
    res.status(500).json({ error: "Banka hesabı oluşturulamadı" });
  }
});

router.get("/banka-hesaplari/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ h: bankaHesaplari, sirketAd: sirketler.ad })
      .from(bankaHesaplari)
      .leftJoin(sirketler, eq(bankaHesaplari.sirketId, sirketler.id))
      .where(eq(bankaHesaplari.id, id));
    if (!row) return res.status(404).json({ error: "Banka hesabı bulunamadı" });
    const bakiyeler = await hesaplaHesapBakiyeleri();
    res.json(formatHesap(row.h, row.sirketAd, bakiyeler[id] ?? 0));
  } catch (err) {
    res.status(500).json({ error: "Banka hesabı getirilemedi" });
  }
});

router.patch("/banka-hesaplari/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { bankaAdi, hesapAdi, iban, paraBirimi, subeAdi, aciklama, aktif } = req.body;
    const [row] = await db.update(bankaHesaplari)
      .set({ bankaAdi, hesapAdi, iban, paraBirimi, subeAdi, aciklama, aktif })
      .where(eq(bankaHesaplari.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Banka hesabı bulunamadı" });
    const bakiyeler = await hesaplaHesapBakiyeleri();
    res.json(formatHesap(row, null, bakiyeler[id] ?? 0));
  } catch (err) {
    res.status(500).json({ error: "Banka hesabı güncellenemedi" });
  }
});

router.delete("/banka-hesaplari/:id", async (req, res) => {
  try {
    await db.delete(bankaHesaplari).where(eq(bankaHesaplari.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Banka hesabı silinemedi" });
  }
});

router.get("/banka-hesaplari/:id/hareketler", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const ods = await db.select().from(odemeler)
      .where(eq(odemeler.bankaHesabiId, id))
      .orderBy(odemeler.tarih);

    let toplamGelen = 0;
    let toplamGiden = 0;
    const hareketler = ods.map(o => {
      const tutar = Number(o.tutar);
      if (o.tip === "tahsilat") toplamGelen += tutar;
      else toplamGiden += tutar;
      return {
        id: o.id, tarih: o.tarih, tip: o.tip,
        tutar, paraBirimi: o.paraBirimi,
        aciklama: o.aciklama, cariAd: null, faturaNo: null,
      };
    });

    res.json({ hesapId: id, hareketler, toplamGelen, toplamGiden, netBakiye: toplamGelen - toplamGiden });
  } catch (err) {
    res.status(500).json({ error: "Hareketler getirilemedi" });
  }
});

async function hesaplaHesapBakiyeleri(): Promise<Record<number, number>> {
  const rows = await db
    .select({
      bankaHesabiId: odemeler.bankaHesabiId,
      tip: odemeler.tip,
      toplam: sql<string>`sum(${odemeler.tutar})`,
    })
    .from(odemeler)
    .where(sql`${odemeler.bankaHesabiId} is not null`)
    .groupBy(odemeler.bankaHesabiId, odemeler.tip);

  const result: Record<number, number> = {};
  for (const r of rows) {
    if (r.bankaHesabiId == null) continue;
    if (!result[r.bankaHesabiId]) result[r.bankaHesabiId] = 0;
    const v = Number(r.toplam ?? 0);
    result[r.bankaHesabiId] += r.tip === "tahsilat" ? v : -v;
  }
  return result;
}

function formatHesap(h: typeof bankaHesaplari.$inferSelect, sirketAd: string | null | undefined, bakiye: number) {
  return {
    id: h.id,
    sirketId: h.sirketId,
    sirketAd: sirketAd ?? null,
    bankaAdi: h.bankaAdi,
    hesapAdi: h.hesapAdi,
    iban: h.iban,
    paraBirimi: h.paraBirimi,
    subeAdi: h.subeAdi,
    aciklama: h.aciklama,
    aktif: h.aktif,
    bakiye,
    olusturmaTarihi: h.olusturmaTarihi,
  };
}

export default router;
