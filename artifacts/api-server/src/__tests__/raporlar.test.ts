import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, inArray } from "drizzle-orm";
import { db, firmalar, faturalar, odemeler, gemiler, kullanicilar, tahsilatEslesmeleri } from "@workspace/db";
import app from "../app";
import { JWT_SECRET } from "../middleware/auth";

const suffix = `rapor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let catiId = 0, otherId = 0, bagliId = 0, gemiId = 0, userId = 0, limitedId = 0, token = "", limitedToken = "", sequence = 0;
const auth = () => ({ Authorization: `Bearer ${token}` });
const query = (extra = {}) => ({ catiFirmaId: catiId, yil: 2026, paraBirimi: "USD", ...extra });
const report = async (extra = {}) => {
  const r = await request(app).get("/api/raporlar/finansal-ozet").query(query(extra)).set(auth());
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
};
async function invoice(extra: Partial<typeof faturalar.$inferInsert> = {}) {
  const [f] = await db.insert(faturalar).values({
    catiFirmaId: catiId, bagliFirmaId: bagliId, gemiId,
    faturaNo: `${suffix}-${++sequence}`, faturaTarihi: "2026-01-01", vadeTarihi: "2026-01-31",
    paraBirimi: "USD", toplamTutar: "400", kdvTutari: "100", genelToplam: "500", durum: "acik", ...extra,
  }).returning();
  return f;
}
async function cash(tutar: number, extra: Partial<typeof odemeler.$inferInsert> = {}) {
  const [o] = await db.insert(odemeler).values({
    catiFirmaId: catiId, bagliFirmaId: bagliId, tip: "tahsilat", tarih: "2026-02-01",
    paraBirimi: "USD", tutar: String(tutar), ...extra,
  }).returning();
  return o;
}
async function temizle() {
  if (!catiId) return;
  await db.delete(odemeler).where(inArray(odemeler.catiFirmaId, [catiId, otherId]));
  await db.delete(faturalar).where(inArray(faturalar.catiFirmaId, [catiId, otherId]));
}
beforeAll(async () => {
  const [user] = await db.insert(kullanicilar).values({
    ad: "Rapor Testi", email: `${suffix}@example.invalid`, parola: "unused", rol: "yonetici", aktif: true,
  }).returning();
  userId = user.id;
  token = jwt.sign({ id: user.id, rol: user.rol, ad: user.ad, email: user.email, sirketler: [] }, JWT_SECRET);
  const [cati, other] = await db.insert(firmalar).values([
    { ad: suffix, tip: "cati" }, { ad: `${suffix}-other`, tip: "cati" },
  ]).returning();
  catiId = cati.id; otherId = other.id;
  const [bagli] = await db.insert(firmalar).values({ ad: `${suffix}-bagli`, tip: "bagli", ustFirmaId: cati.id }).returning();
  bagliId = bagli.id;
  const [limited] = await db.insert(kullanicilar).values({
    ad: "Sınırlı Rapor Testi", email: `${suffix}-limited@example.invalid`, parola: "unused", rol: "salt_okunur", aktif: true,
  }).returning();
  limitedId = limited.id;
  limitedToken = jwt.sign({
    id: limited.id, rol: limited.rol, ad: limited.ad, email: limited.email,
    sirketler: [{ sirketId: catiId, sirketAd: suffix, rol: "salt_okunur" }],
  }, JWT_SECRET);
  const [gemi] = await db.insert(gemiler).values({ ad: `${suffix}-ship`, firmaId: bagli.id }).returning();
  gemiId = gemi.id;
});
beforeEach(temizle);
afterAll(async () => {
  await temizle();
  if (gemiId) await db.delete(gemiler).where(eq(gemiler.id, gemiId));
  if (bagliId) await db.delete(firmalar).where(eq(firmalar.id, bagliId));
  if (catiId) await db.delete(firmalar).where(inArray(firmalar.id, [catiId, otherId]));
  if (userId) await db.delete(kullanicilar).where(inArray(kullanicilar.id, [userId, limitedId]));
});

describe("rapor muhasebe doğruluğu", () => {
  it("iki 500 USD faturaya 750 tahsilat dağıtımını ikinci para girişi saymaz", async () => {
    const f1 = await invoice(), f2 = await invoice();
    const o = await cash(750);
    await db.insert(tahsilatEslesmeleri).values([
      { tahsilatId: o.id, faturaId: f1.id, tutar: "500" },
      { tahsilatId: o.id, faturaId: f2.id, tutar: "250" },
    ]);
    const r = await report();
    expect(r.ozet).toMatchObject({ toplamFatura: 1000, faturayaSayilan: 750, kalanAlacak: 250, nakitTahsilat: 750, faturaSayisi: 2 });
    expect(r.aylik[0]).toMatchObject({ faturalanan: 1000, faturayaSayilan: 750, tahsilat: 0 });
    expect(r.aylik[1]).toMatchObject({ faturalanan: 0, tahsilat: 750 });
    expect(r.musteriler[0]).toMatchObject({ faturalanan: 1000, karsilanan: 750, kalan: 250 });
    expect(r.gemiler[0]).toMatchObject({ faturalanan: 1000, karsilanan: 750, kalan: 250 });
    expect(r.faturalar.map((f: { durum: string }) => f.durum).sort()).toEqual(["kismi_odendi", "odendi"]);
  });
  it("eşleştirme nakdi değiştirmez, bağımsız tahsilat faturayı kendiliğinden kapatmaz", async () => {
    const f = await invoice(), o = await cash(750);
    const once = await report();
    expect(once.ozet).toMatchObject({ faturayaSayilan: 0, kalanAlacak: 500, nakitTahsilat: 750 });
    await db.insert(tahsilatEslesmeleri).values({ tahsilatId: o.id, faturaId: f.id, tutar: "200" });
    const sonra = await report();
    expect(sonra.ozet).toMatchObject({ faturayaSayilan: 200, kalanAlacak: 300, nakitTahsilat: 750 });
    await db.delete(tahsilatEslesmeleri).where(eq(tahsilatEslesmeleri.tahsilatId, o.id));
    expect((await report()).ozet).toMatchObject({ faturayaSayilan: 0, kalanAlacak: 500, nakitTahsilat: 750 });
  });
  it("eski doğrudan fatura ödemesi ve eşleştirme yalnızca birer kez hesaplanır", async () => {
    const f = await invoice(), o = await cash(300);
    await cash(200, { faturaId: f.id });
    await db.insert(tahsilatEslesmeleri).values({ tahsilatId: o.id, faturaId: f.id, tutar: "100" });
    expect((await report()).ozet).toMatchObject({ toplamFatura: 500, faturayaSayilan: 300, kalanAlacak: 200, nakitTahsilat: 500 });
  });
  it("taslak ve iptal faturalar hiçbir toplam veya analize girmez, KDV açık faturayı kapsar", async () => {
    await invoice();
    await invoice({ durum: "taslak" });
    await invoice({ durum: "iptal" });
    const r = await report();
    expect(r.ozet).toMatchObject({ toplamFatura: 500, faturaSayisi: 1 });
    expect(r.kdv).toMatchObject({ kdvHaricToplam: 400, kdvTutariToplam: 100, kdvDahilToplam: 500 });
    expect(r.musteriler[0].faturaSayisi).toBe(1);
    expect(r.gemiler[0].faturaSayisi).toBe(1);
  });
  it("USD, EUR ve TRY tutarlarını karıştırmaz, yalnız ödemede görünen para birimini sunar", async () => {
    await invoice();
    await invoice({ paraBirimi: "EUR", genelToplam: "700" });
    await cash(100);
    await cash(800, { paraBirimi: "EUR" });
    await cash(10000, { paraBirimi: "TRY" });
    const usd = await report();
    expect(usd.paraBirimleri).toEqual(["EUR", "TRY", "USD"]);
    expect((await report({ ay: 3 })).paraBirimleri).toEqual(["EUR", "TRY", "USD"]);
    expect(usd.ozet).toMatchObject({ toplamFatura: 500, nakitTahsilat: 100 });
    expect(usd.musteriler[0].faturalanan).toBe(500);
    expect((await report({ paraBirimi: "EUR" })).ozet).toMatchObject({ toplamFatura: 700, nakitTahsilat: 800 });
    expect((await report({ paraBirimi: "TRY" })).ozet).toMatchObject({ toplamFatura: 0, nakitTahsilat: 10000 });
  });
  it("ay filtresi tüm raporu etkiler, önceki yıl faturasının tahsilatı gerçek nakit ayında yer alır", async () => {
    const eski = await invoice({ faturaTarihi: "2025-12-15" });
    await invoice({ faturaTarihi: "2026-01-15" });
    await cash(200, { faturaId: eski.id, tarih: "2026-02-10" });
    const r = await report({ ay: 2 });
    expect(r.ozet).toMatchObject({ toplamFatura: 0, faturayaSayilan: 0, nakitTahsilat: 200 });
    expect(r.aylik).toHaveLength(1);
    expect(r.aylik[0]).toMatchObject({ ay: 2, tahsilat: 200, faturalanan: 0 });
    expect(r.musteriler).toHaveLength(0);
    expect(r.kdv.kdvDahilToplam).toBe(0);
  });
  it("müşteriye yapılan ödemeyi tahsilat saymaz, net nakit ve dönem hareketini ayırır", async () => {
    await invoice();
    await cash(200);
    await cash(50, { tip: "odeme" });
    expect((await report()).ozet).toMatchObject({ toplamFatura: 500, nakitTahsilat: 200, nakitOdeme: 50, netNakit: 150, donemNetHareketi: 350 });
  });
  it("yaşlandırma vadesi gelmeyenleri de kapsar ve kısmi ödemeden sonraki toplamla eşleşir", async () => {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
    const f = await invoice({ vadeTarihi: "2199-12-31" });
    await cash(200, { faturaId: f.id });
    await invoice({ vadeTarihi: "2001-01-01" });
    await invoice({ vadeTarihi: today });
    const r = await report();
    expect(r.yaslandirma[0]).toMatchObject({ kalan: 800, faturaSayisi: 2 });
    expect(r.yaslandirma[4]).toMatchObject({ kalan: 500, faturaSayisi: 1 });
    expect(r.yaslandirma.reduce((sum: number, d: { kalan: number }) => sum + d.kalan, 0)).toBe(r.ozet.kalanAlacak);
  });
  it("gemi seçilmeyen fatura analiz dışında kalmaz, kuruş hassasiyeti korunur", async () => {
    await invoice({ genelToplam: "0.10", toplamTutar: "0.10", kdvTutari: "0", gemiId: null });
    await invoice({ genelToplam: "0.20", toplamTutar: "0.20", kdvTutari: "0", gemiId: null });
    const r = await report();
    expect(r.ozet.toplamFatura).toBe(0.3);
    expect(r.gemiler[0]).toMatchObject({ id: null, faturalanan: 0.3, faturaSayisi: 2 });
    expect(r.kdv.kdvDahilToplam).toBe(0.3);
  });
  it("boş dönem, eski yıl ve geçersiz filtreler doğru sonuç verir", async () => {
    await invoice({ faturaTarihi: "2018-01-01" });
    const r = await report();
    expect(r.ozet.toplamFatura).toBe(0);
    expect(r.aylik).toHaveLength(12);
    expect(r.yillar).toContain(2018);
    expect((await report({ yil: 2018 })).ozet.toplamFatura).toBe(500);
    for (const extra of [{ ay: 13 }, { ay: 1.5 }, { yil: "abc" }, { catiFirmaId: -1 }, { paraBirimi: "ALL" + "X" }]) {
      const response = await request(app).get("/api/raporlar/finansal-ozet").query(query(extra)).set(auth());
      expect(response.status).toBe(400);
    }
  });
  it("eski rapor URL'leri de aynı doğru kapsam ve kalan tutar hesabını kullanır", async () => {
    const f = await invoice();
    await cash(200, { faturaId: f.id });
    await invoice({ durum: "iptal" });
    const requestOld = async (path: string) => {
      const r = await request(app).get(`/api/raporlar/${path}`).query(query()).set(auth());
      expect(r.status).toBe(200); return r.body;
    };
    expect(await requestOld("fatura-ozeti")).toMatchObject({ toplamFatura: 500, toplamTahsilat: 200, toplamAcik: 300 });
    expect((await requestOld("gemi-gelir")).gemiler[0]).toMatchObject({ toplamFatura: 500, toplamTahsilat: 200 });
    expect((await requestOld("bagli-firma-analiz")).firmalar[0]).toMatchObject({ acikFatura: 300 });
    expect(await requestOld("kdv-ozeti")).toMatchObject({ kdvDahilToplam: 500 });
  });
  it("CSV başlıkları satırlarla eşleşir, BOM içerir ve formül enjeksiyonu etkisizdir", async () => {
    await invoice({ faturaNo: "=SUM(1,2)" });
    const r = await request(app).get("/api/raporlar/kdv-ozeti").query({ ...query(), format: "csv" }).set(auth());
    expect(r.status).toBe(200);
    expect(r.text).toContain(`"'=SUM(1,2)"`);
    expect(r.text.split("\r\n")[0]).toContain("faturaNo");
    expect(r.headers["content-disposition"]).toContain("USD");
  });
  it("firma filtresi başka çatıların tutarlarını karıştırmaz, kimliksiz erişime kapalıdır", async () => {
    await invoice();
    await invoice({ catiFirmaId: otherId, genelToplam: "90000" });
    await cash(99000, { catiFirmaId: otherId });
    expect((await report()).ozet).toMatchObject({ toplamFatura: 500, nakitTahsilat: 0 });
    expect((await request(app).get("/api/raporlar/finansal-ozet")).status).toBe(401);
  });
  it("sınırlı kullanıcı filtresiz raporda yalnızca izinli çatılarını görür", async () => {
    await invoice();
    await invoice({ catiFirmaId: otherId, genelToplam: "90000" });
    await cash(99000, { catiFirmaId: otherId });
    const headers = { Authorization: `Bearer ${limitedToken}` };
    const allowed = await request(app).get("/api/raporlar/finansal-ozet").query({ yil: 2026, paraBirimi: "USD" }).set(headers);
    expect(allowed.status).toBe(200);
    expect(allowed.body.ozet).toMatchObject({ toplamFatura: 500, nakitTahsilat: 0 });
    const denied = await request(app).get("/api/raporlar/finansal-ozet").query(query({ catiFirmaId: otherId })).set(headers);
    expect(denied.status).toBe(403);
  });
});
