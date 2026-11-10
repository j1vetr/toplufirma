import { Router } from "express";
import { db, faturalar, odemeler, tahsilatEslesmeleri } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { KarsilaFaturaTahsilattanBody } from "@workspace/api-zod";
import { requireYazma, sirketErisimKontrol, firmaYazmaDenetimi } from "../middleware/auth";
import { finansKilidi, faturaDurumuHesapla, faturaOdenenKurus, kullanilabilirTahsilatlar, kurusaCevir, type FinansDb } from "../utils/faturaTahsilat";

const router = Router();
async function ozet(tx: FinansDb, fat: typeof faturalar.$inferSelect) {
  const kaynaklar = await kullanilabilirTahsilatlar(tx, fat);
  const rows = await tx.select({ id: tahsilatEslesmeleri.id, tahsilatId: odemeler.id, tarih: odemeler.tarih,
    tutar: tahsilatEslesmeleri.tutar, aciklama: odemeler.aciklama })
    .from(tahsilatEslesmeleri).innerJoin(odemeler, eq(tahsilatEslesmeleri.tahsilatId, odemeler.id))
    .where(eq(tahsilatEslesmeleri.faturaId, fat.id)).orderBy(tahsilatEslesmeleri.id);
  return { kullanilabilirTutar: kaynaklar.reduce((s, o) => s + o.kalanKurus, 0) / 100,
    eslesmeler: rows.map(r => ({ ...r, tutar: Number(r.tutar) })) };
}
router.get("/faturalar/:id/tahsilat-eslesmeleri", async (req, res) => {
  const [fat] = await db.select().from(faturalar).where(eq(faturalar.id, Number(req.params.id)));
  if (!fat) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
  if (!sirketErisimKontrol(fat.catiFirmaId, req)) { res.status(403).json({ error: "Bu kayda erişim izniniz yok" }); return; }
  res.json(await ozet(db, fat));
});
router.post("/faturalar/:id/tahsilat-eslesmeleri", requireYazma, async (req, res) => {
  const parsed = KarsilaFaturaTahsilattanBody.safeParse(req.body);
  const kurus = parsed.success ? kurusaCevir(parsed.data.tutar) : null;
  if (kurus == null || kurus <= 0) { res.status(400).json({ error: "Sıfırdan büyük, en fazla iki ondalıklı tutar girin" }); return; }
  const id = Number(req.params.id);
  const [existing] = await db.select().from(faturalar).where(eq(faturalar.id, id));
  if (!existing) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
  if (!sirketErisimKontrol(existing.catiFirmaId, req) || !firmaYazmaDenetimi(existing.catiFirmaId, req)) {
    res.status(403).json({ error: "Bu firmada işlem yetkiniz yok" }); return;
  }
  const result = await db.transaction(async tx => {
    await finansKilidi(tx, existing.catiFirmaId);
    const [fat] = await tx.select().from(faturalar).where(eq(faturalar.id, id)).for("update");
    if (!fat || ["taslak", "iptal"].includes(fat.durum)) return { error: "Taslak veya iptal faturaya tahsilat saydırılamaz" };
    const kalan = Math.round(Number(fat.genelToplam) * 100) - await faturaOdenenKurus(tx, fat);
    if (kurus > kalan) return { error: "Tutar faturanın kalan borcunu aşamaz" };
    const kaynaklar = await kullanilabilirTahsilatlar(tx, fat);
    if (kaynaklar.reduce((s, o) => s + o.kalanKurus, 0) < kurus) return { error: "Aynı bağlı firma ve para biriminde yeterli kullanılmamış tahsilat yok" };
    let kalanKurus = kurus;
    for (const o of kaynaklar) {
      if (!kalanKurus) break;
      const amount = Math.min(kalanKurus, o.kalanKurus);
      await tx.insert(tahsilatEslesmeleri).values({ tahsilatId: o.id, faturaId: id, tutar: (amount / 100).toFixed(2) })
        .onConflictDoUpdate({ target: [tahsilatEslesmeleri.tahsilatId, tahsilatEslesmeleri.faturaId],
          set: { tutar: sql`${tahsilatEslesmeleri.tutar} + ${(amount / 100).toFixed(2)}::numeric` } });
      kalanKurus -= amount;
    }
    await faturaDurumuHesapla(tx, id);
    return await ozet(tx, fat);
  });
  if ("error" in result) { res.status(400).json(result); return; }
  res.json(result);
});
router.delete("/faturalar/:id/tahsilat-eslesmeleri/:eslesmeId", requireYazma, async (req, res) => {
  const id = Number(req.params.id);
  const [fat] = await db.select().from(faturalar).where(eq(faturalar.id, id));
  if (!fat) { res.status(404).json({ error: "Fatura bulunamadı" }); return; }
  if (!sirketErisimKontrol(fat.catiFirmaId, req) || !firmaYazmaDenetimi(fat.catiFirmaId, req)) {
    res.status(403).json({ error: "Bu firmada işlem yetkiniz yok" }); return;
  }
  const removed = await db.transaction(async tx => {
    await finansKilidi(tx, fat.catiFirmaId);
    await tx.select().from(faturalar).where(eq(faturalar.id, id)).for("update");
    const rows = await tx.delete(tahsilatEslesmeleri).where(and(
      eq(tahsilatEslesmeleri.id, Number(req.params.eslesmeId)), eq(tahsilatEslesmeleri.faturaId, id),
    )).returning();
    await faturaDurumuHesapla(tx, id);
    return rows.length;
  });
  if (!removed) { res.status(404).json({ error: "Eşleştirme bulunamadı" }); return; }
  res.status(204).send();
});
export default router;
