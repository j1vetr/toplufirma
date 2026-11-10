// Run cari-odeme-fixture.ts first, then this script. Cleanup with that script's cleanup command.
import { readFile } from "node:fs/promises";
import { db, pool, faturalar, odemeler, tahsilatEslesmeleri } from "../index";
const fixture = JSON.parse(await readFile("/tmp/cari-odeme-browser-fixture.json", "utf8"));
const yil = new Date().getFullYear();
await db.transaction(async tx => {
  await tx.insert(tahsilatEslesmeleri).values([
    { tahsilatId: fixture.receiptId, faturaId: fixture.faturaIds[0], tutar: "500" },
    { tahsilatId: fixture.receiptId, faturaId: fixture.faturaIds[1], tutar: "250" },
  ]);
  for (const [index, amount] of [900, 1500, 1200, 2400, 1900, 2700, 1400, 3100, 2200, 3500].entries()) {
    const month = index + 1, tarih = `${yil}-${String(month).padStart(2, "0")}-15`;
    const base = Number((amount / 1.2).toFixed(2));
    const [f] = await tx.insert(faturalar).values({
      catiFirmaId: fixture.catiId, bagliFirmaId: fixture.bagliId, gemiId: fixture.gemiId,
      faturaNo: `${fixture.suffix}-R${month}`, faturaTarihi: tarih,
      vadeTarihi: `${yil}-${String(month).padStart(2, "0")}-28`,
      toplamTutar: base.toFixed(2), kdvTutari: (amount - base).toFixed(2),
      genelToplam: String(amount), paraBirimi: "USD", durum: "acik",
    }).returning();
    if (month !== 7) await tx.insert(odemeler).values({
      catiFirmaId: fixture.catiId, bagliFirmaId: fixture.bagliId, faturaId: f.id,
      tarih: `${yil}-${String(month + 1).padStart(2, "0")}-03`,
      tip: "tahsilat", paraBirimi: "USD", tutar: (amount * 0.65).toFixed(2),
    });
  }
  await tx.insert(faturalar).values([
    { catiFirmaId: fixture.catiId, bagliFirmaId: fixture.bagliId, gemiId: fixture.gemiId,
      faturaNo: `${fixture.suffix}-EUR`, faturaTarihi: `${yil}-06-10`, vadeTarihi: `${yil}-07-10`,
      genelToplam: "2000", toplamTutar: "2000", kdvTutari: "0", paraBirimi: "EUR", durum: "acik" },
    { catiFirmaId: fixture.catiId, bagliFirmaId: fixture.bagliId, faturaNo: `${fixture.suffix}-DRAFT`,
      faturaTarihi: `${yil}-06-10`, vadeTarihi: `${yil}-07-10`, genelToplam: "90000", durum: "taslak" },
    { catiFirmaId: fixture.catiId, bagliFirmaId: fixture.bagliId, faturaNo: `${fixture.suffix}-CANCEL`,
      faturaTarihi: `${yil}-06-10`, vadeTarihi: `${yil}-07-10`, genelToplam: "90000", durum: "iptal" },
  ]);
  await tx.insert(odemeler).values({
    catiFirmaId: fixture.catiId, bagliFirmaId: fixture.bagliId, tarih: `${yil}-08-25`,
    tip: "odeme", paraBirimi: "USD", tutar: "450",
  });
});
await pool.end();
console.log("Monthly report fixtures ready. All records belong to the isolated fixture company.");
