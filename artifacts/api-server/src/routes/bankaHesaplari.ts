import { Router } from "express";
import { db } from "@workspace/db";
import { bankaHesaplari, sirketler, odemeler } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireYazma, sirketErisimKontrol, sirketlerFiltrele } from "../middleware/auth";

const router = Router();

router.get("/banka-hesaplari", async (req, res) => {
  try {
    const { sirketId } = req.query as Record<string, string>;
    const rows = await db
      .select({ h: bankaHesaplari, sirketAd: sirketler.ad })
      .from(bankaHesaplari)
      .leftJoin(sirketler, eq(bankaHesaplari.sirketId, sirketler.id))
      .orderBy(bankaHesaplari.bankaAdi);

    const { rows: scoped, yetkisiz } = sirketlerFiltrele(
      rows.map(r => ({ ...r, sirketId: r.h.sirketId })), req, sirketId
    );
    if (yetkisiz) return res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
    const filtered = rows.filter(r => scoped.some(s => s.h.id === r.h.id));

    const bakiyeler = await hesaplaHesapBakiyeleri();
    res.json(filtered.map(r => formatHesap(r.h, r.sirketAd, bakiyeler[r.h.id] ?? 0)));
  } catch {
    res.status(500).json({ error: "Banka hesapları listelenemedi" });
  }
});

router.post("/banka-hesaplari", requireYazma, async (req, res) => {
  try {
    const { sirketId, bankaAdi, hesapAdi, iban, paraBirimi, subeAdi, aciklama, aktif } = req.body;
    if (!sirketId || !bankaAdi || !hesapAdi) return res.status(400).json({ error: "sirketId, bankaAdi ve hesapAdi zorunludur" });
    if (!sirketErisimKontrol(Number(sirketId), req)) return res.status(403).json({ error: "Bu şirkete erişim izniniz yok" });
    const [row] = await db.insert(bankaHesaplari).values({
      sirketId, bankaAdi, hesapAdi, iban, paraBirimi: paraBirimi ?? "TRY",
      subeAdi, aciklama, aktif: aktif ?? true,
    }).returning();
    res.status(201).json(formatHesap(row, null, 0));
  } catch {
    res.status(500).json({ error: "Banka hesabı oluşturulamadı" });
  }
});

router.get("/banka-hesaplari/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ h: bankaHesaplari, sirketAd: sirketler.ad })
      .from(bankaHesaplari).leftJoin(sirketler, eq(bankaHesaplari.sirketId, sirketler.id))
      .where(eq(bankaHesaplari.id, id));
    if (!row) return res.status(404).json({ error: "Banka hesabı bulunamadı" });
    if (!sirketErisimKontrol(row.h.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });
    const bakiyeler = await hesaplaHesapBakiyeleri();
    res.json(formatHesap(row.h, row.sirketAd, bakiyeler[id] ?? 0));
  } catch {
    res.status(500).json({ error: "Banka hesabı getirilemedi" });
  }
});

router.patch("/banka-hesaplari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(bankaHesaplari).where(eq(bankaHesaplari.id, id));
    if (!existing) return res.status(404).json({ error: "Banka hesabı bulunamadı" });
    if (!sirketErisimKontrol(existing.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });

    const { bankaAdi, hesapAdi, iban, paraBirimi, subeAdi, aciklama, aktif } = req.body;
    const [row] = await db.update(bankaHesaplari)
      .set({ bankaAdi, hesapAdi, iban, paraBirimi, subeAdi, aciklama, aktif })
      .where(eq(bankaHesaplari.id, id)).returning();
    const bakiyeler = await hesaplaHesapBakiyeleri();
    res.json(formatHesap(row, null, bakiyeler[id] ?? 0));
  } catch {
    res.status(500).json({ error: "Banka hesabı güncellenemedi" });
  }
});

router.delete("/banka-hesaplari/:id", requireYazma, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(bankaHesaplari).where(eq(bankaHesaplari.id, id));
    if (!existing) return res.status(404).json({ error: "Banka hesabı bulunamadı" });
    if (!sirketErisimKontrol(existing.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });
    await db.delete(bankaHesaplari).where(eq(bankaHesaplari.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Banka hesabı silinemedi" });
  }
});

router.get("/banka-hesaplari/:id/hareketler", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [hesap] = await db.select().from(bankaHesaplari).where(eq(bankaHesaplari.id, id));
    if (!hesap) return res.status(404).json({ error: "Banka hesabı bulunamadı" });
    if (!sirketErisimKontrol(hesap.sirketId, req)) return res.status(403).json({ error: "Bu kayda erişim izniniz yok" });

    const ods = await db.select().from(odemeler).where(eq(odemeler.bankaHesabiId, id)).orderBy(odemeler.tarih);
    let toplamGelen = 0, toplamGiden = 0;
    const hareketler = ods.map(o => {
      const tutar = Number(o.tutar);
      if (o.tip === "tahsilat") toplamGelen += tutar; else toplamGiden += tutar;
      return { id: o.id, tarih: o.tarih, tip: o.tip, tutar, paraBirimi: o.paraBirimi, aciklama: o.aciklama, cariAd: null, faturaNo: null };
    });
    res.json({ hesapId: id, hareketler, toplamGelen, toplamGiden, netBakiye: toplamGelen - toplamGiden });
  } catch {
    res.status(500).json({ error: "Hareketler getirilemedi" });
  }
});

async function hesaplaHesapBakiyeleri(): Promise<Record<number, number>> {
  const rows = await db
    .select({ bankaHesabiId: odemeler.bankaHesabiId, tip: odemeler.tip, toplam: sql<string>`sum(${odemeler.tutar})` })
    .from(odemeler).where(sql`${odemeler.bankaHesabiId} is not null`)
    .groupBy(odemeler.bankaHesabiId, odemeler.tip);
  const result: Record<number, number> = {};
  for (const r of rows) {
    if (r.bankaHesabiId == null) continue;
    if (!result[r.bankaHesabiId]) result[r.bankaHesabiId] = 0;
    result[r.bankaHesabiId] += r.tip === "tahsilat" ? Number(r.toplam ?? 0) : -Number(r.toplam ?? 0);
  }
  return result;
}

function formatHesap(h: typeof bankaHesaplari.$inferSelect, sirketAd: string | null | undefined, bakiye: number) {
  return {
    id: h.id, sirketId: h.sirketId, sirketAd: sirketAd ?? null,
    bankaAdi: h.bankaAdi, hesapAdi: h.hesapAdi, iban: h.iban,
    paraBirimi: h.paraBirimi, subeAdi: h.subeAdi, aciklama: h.aciklama,
    aktif: h.aktif, bakiye, olusturmaTarihi: h.olusturmaTarihi,
  };
}

export default router;
