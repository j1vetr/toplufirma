// Isolated browser-test data only. Run with `pnpm --filter @workspace/db exec tsx src/testing/cari-odeme-fixture.ts`.
// Pass `cleanup` afterwards. Credentials are generated, never taken from real users.
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { db, pool, kullanicilar, firmalar, faturalar, odemeler, gemiler, firmaSirketGorunurluk } from "../index";

const path = "/tmp/cari-odeme-browser-fixture.json";
if (process.argv[2] === "cleanup") {
  const data = JSON.parse(await readFile(path, "utf8"));
  const [firma] = await db.select().from(firmalar).where(eq(firmalar.id, data.catiId));
  if (!firma?.ad.startsWith("E2E-Cari-")) throw new Error("Not an isolated fixture");
  await db.delete(odemeler).where(eq(odemeler.catiFirmaId, data.catiId));
  await db.delete(faturalar).where(eq(faturalar.catiFirmaId, data.catiId));
  await db.delete(gemiler).where(eq(gemiler.id, data.gemiId));
  await db.delete(firmalar).where(inArray(firmalar.id, [data.bagliId, data.digerBagliId]));
  await db.delete(firmalar).where(eq(firmalar.id, data.grupId));
  await db.delete(firmalar).where(eq(firmalar.id, data.catiId));
  await db.delete(kullanicilar).where(eq(kullanicilar.id, data.userId));
  await unlink(path);
  console.log("Isolated browser fixtures removed.");
} else {
  const suffix = `E2E-Cari-${randomUUID().slice(0, 8)}`;
  const email = `${suffix.toLowerCase()}@example.invalid`, parola = randomUUID();
  const data = await db.transaction(async tx => {
    const [user] = await tx.insert(kullanicilar).values({ ad: suffix, email, parola: await bcrypt.hash(parola, 10), rol: "yonetici", aktif: true }).returning();
    const [cati] = await tx.insert(firmalar).values({ tip: "cati", ad: `${suffix}-Cati` }).returning();
    const [grup] = await tx.insert(firmalar).values({ tip: "grup", ad: `${suffix}-Grup` }).returning();
    await tx.insert(firmaSirketGorunurluk).values({ firmaId: grup.id, catiFirmaId: cati.id });
    const [bagli, diger] = await tx.insert(firmalar).values([
      { tip: "bagli", ad: `${suffix}-Bagli`, grupFirmaId: grup.id },
      { tip: "bagli", ad: `${suffix}-Diger`, grupFirmaId: grup.id },
    ]).returning();
    const [gemi] = await tx.insert(gemiler).values({ firmaId: bagli.id, ad: `${suffix}-Gemi` }).returning();
    const today = new Date().toISOString().slice(0, 10);
    const fats = await tx.insert(faturalar).values([1, 2].map(n => ({
      catiFirmaId: cati.id, bagliFirmaId: bagli.id, gemiId: gemi.id,
      faturaNo: `${suffix}-${n}`, faturaTarihi: today, vadeTarihi: today,
      toplamTutar: "500", kdvTutari: "0", genelToplam: "500", durum: "acik" as const,
    }))).returning();
    const [receipt] = await tx.insert(odemeler).values({
      catiFirmaId: cati.id, bagliFirmaId: bagli.id, tip: "tahsilat", tarih: today, tutar: "750", paraBirimi: "USD", aciklama: suffix,
    }).returning();
    return { suffix, email, parola, catiId: cati.id, catiAd: cati.ad, grupId: grup.id,
      bagliId: bagli.id, digerBagliId: diger.id, gemiId: gemi.id, faturaIds: fats.map(f => f.id), faturaNos: fats.map(f => f.faturaNo),
      receiptId: receipt.id, userId: user.id };
  });
  await writeFile(path, JSON.stringify(data), { mode: 0o600 });
  console.log(`Isolated fixture created. Metadata and generated login are in ${path}`);
}
await pool.end();
