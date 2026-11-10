import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, inArray } from "drizzle-orm";
import { db, firmalar, odemeler, faturalar, kullanicilar, firmaSirketGorunurluk, tahsilatEslesmeleri } from "@workspace/db";
import app from "../app";
import { JWT_SECRET } from "../middleware/auth";

const suffix = `eslesme-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today = new Date().toISOString().slice(0, 10);
let catiId = 0, digerCatiId = 0, grupId = 0, bagliId = 0, digerBagliId = 0, userId = 0;
let token = "", counter = 0;
const auth = () => ({ Authorization: `Bearer ${token}` });
async function temizle() {
  if (catiId) {
    await db.delete(odemeler).where(eq(odemeler.catiFirmaId, catiId));
    await db.delete(faturalar).where(eq(faturalar.catiFirmaId, catiId));
  }
}
beforeAll(async () => {
  const [u] = await db.insert(kullanicilar).values({ ad: "Eşleştirme Testi", email: `${suffix}@test.local`, parola: "x", rol: "yonetici", aktif: true }).returning();
  userId = u.id;
  token = jwt.sign({ id: u.id, rol: u.rol, ad: u.ad, email: u.email, sirketler: [] }, JWT_SECRET, { expiresIn: "1h" });
  const [c, d] = await db.insert(firmalar).values([{ tip: "cati", ad: suffix }, { tip: "cati", ad: `${suffix}-diger` }]).returning();
  catiId = c.id; digerCatiId = d.id;
  const [g] = await db.insert(firmalar).values({ tip: "grup", ad: suffix }).returning();
  grupId = g.id;
  await db.insert(firmaSirketGorunurluk).values({ firmaId: grupId, catiFirmaId: catiId });
  const [b, dBagli] = await db.insert(firmalar).values([
    { tip: "bagli", ad: suffix, grupFirmaId: grupId }, { tip: "bagli", ad: `${suffix}-diger`, grupFirmaId: grupId },
  ]).returning();
  bagliId = b.id; digerBagliId = dBagli.id;
});
beforeEach(temizle);
afterAll(async () => {
  await temizle();
  if (bagliId) await db.delete(firmalar).where(inArray(firmalar.id, [bagliId, digerBagliId]));
  if (grupId) await db.delete(firmalar).where(eq(firmalar.id, grupId));
  if (catiId) await db.delete(firmalar).where(inArray(firmalar.id, [catiId, digerCatiId]));
  if (userId) await db.delete(kullanicilar).where(eq(kullanicilar.id, userId));
});
async function invoice(amount = 500, extra: Partial<typeof faturalar.$inferInsert> = {}) {
  return (await db.insert(faturalar).values({ catiFirmaId: catiId, bagliFirmaId: bagliId,
    faturaNo: `${suffix}-${++counter}`, faturaTarihi: today, vadeTarihi: today,
    toplamTutar: String(amount), kdvTutari: "0", genelToplam: String(amount), durum: "acik", ...extra,
  }).returning())[0];
}
async function receipt(amount: number, extra: object = {}) {
  const r = await request(app).post("/api/odemeler").set(auth()).send({
    catiFirmaId: catiId, bagliFirmaId: bagliId, tip: "tahsilat", tarih: today,
    tutar: amount, paraBirimi: "USD", odemeYontemi: "nakit", ...extra,
  });
  expect(r.status).toBe(201);
  return r.body;
}
const match = (id: number, tutar: number) => request(app).post(`/api/faturalar/${id}/tahsilat-eslesmeleri`).set(auth()).send({ tutar });
const detail = async (id: number) => (await request(app).get(`/api/faturalar/${id}`).set(auth())).body;
const summary = async (id: number) => (await request(app).get(`/api/faturalar/${id}/tahsilat-eslesmeleri`).set(auth())).body;

describe.sequential("Tahsilatı yeni para girişi olmadan faturalara saydırma", () => {
  it("iki 500 USD faturaya 750 USD tahsilatı dağıtır, caride yalnızca 750 USD görünür", async () => {
    const a = await invoice(), b = await invoice();
    const r = await receipt(750);
    expect((await match(a.id, 500)).status).toBe(200);
    expect((await match(b.id, 250)).status).toBe(200);
    expect(await detail(a.id)).toMatchObject({ durum: "odendi", odenenTutar: 500, kalanTutar: 0 });
    expect(await detail(b.id)).toMatchObject({ durum: "kismi_odendi", odenenTutar: 250, kalanTutar: 250 });
    const rows = await db.select().from(odemeler).where(eq(odemeler.catiFirmaId, catiId));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].tutar)).toBe(750);
    expect(rows[0].faturaId).toBeNull();
    for (const path of [`/api/cariler/${bagliId}?catiFirmaId=${catiId}`, `/api/cariler/grup/${grupId}?catiFirmaId=${catiId}`]) {
      const cari = await request(app).get(path).set(auth());
      expect(cari.status).toBe(200);
      expect(cari.body.ozet).toMatchObject({ toplamBorc: 1000, toplamAlacak: 750, bakiye: 250 });
    }
    const saved = await request(app).get(`/api/odemeler/${r.id}`).set(auth());
    expect(saved.body.faturaEslesmeleri).toHaveLength(2);
    expect(saved.body.kullanilmamisTutar).toBe(0);
    // Even the legacy status endpoint must not create another collection.
    await request(app).patch(`/api/faturalar/${a.id}`).set(auth()).send({ durum: "odendi" });
    expect(await db.select().from(odemeler).where(eq(odemeler.catiFirmaId, catiId))).toHaveLength(1);
  });
  it("yeni kısmi ödemeyi bir kez işler, kalan ödendiğinde faturayı kapatır", async () => {
    const f = await invoice();
    await receipt(200, { faturaId: f.id });
    expect(await detail(f.id)).toMatchObject({ durum: "kismi_odendi", odenenTutar: 200, kalanTutar: 300 });
    await receipt(300, { faturaId: f.id });
    expect(await detail(f.id)).toMatchObject({ durum: "odendi", odenenTutar: 500, kalanTutar: 0 });
  });
  it("yeni ödeme ile mevcut tahsilatı birlikte hesaplar ve fazla ödemeyi reddeder", async () => {
    const f = await invoice();
    await receipt(300);
    await match(f.id, 300);
    const fazla = await request(app).post("/api/odemeler").set(auth()).send({
      catiFirmaId: catiId, bagliFirmaId: bagliId, faturaId: f.id, tip: "tahsilat",
      tarih: today, tutar: 201, paraBirimi: "USD",
    });
    expect(fazla.status).toBe(400);
    await receipt(200, { faturaId: f.id });
    expect(await detail(f.id)).toMatchObject({ durum: "odendi", odenenTutar: 500 });
  });
  it("kullanılmış tahsilatı veya faturanın kalanını aşamaz", async () => {
    const f = await invoice(), b = await invoice();
    await receipt(600);
    expect((await match(f.id, 501)).status).toBe(400);
    expect((await match(f.id, 500)).status).toBe(200);
    expect((await match(b.id, 101)).status).toBe(400);
    expect((await match(b.id, 100)).status).toBe(200);
  });
  it("eşleştirmeyi kaldırır, parayı korur, faturayı yeniden açar", async () => {
    const f = await invoice();
    const r = await receipt(500);
    await match(f.id, 500);
    const s = await summary(f.id);
    const del = await request(app).delete(`/api/faturalar/${f.id}/tahsilat-eslesmeleri/${s.eslesmeler[0].id}`).set(auth());
    expect(del.status).toBe(204);
    expect(await detail(f.id)).toMatchObject({ durum: "acik", odenenTutar: 0 });
    expect((await summary(f.id)).kullanilabilirTutar).toBe(500);
    expect(await db.select().from(odemeler).where(eq(odemeler.id, r.id))).toHaveLength(1);
  });
  it("tahsilat silinince bağlı tüm faturaların durumlarını günceller", async () => {
    const a = await invoice(), b = await invoice();
    const r = await receipt(750);
    await match(a.id, 500); await match(b.id, 250);
    expect((await request(app).delete(`/api/odemeler/${r.id}`).set(auth())).status).toBe(204);
    expect(await detail(a.id)).toMatchObject({ durum: "acik", odenenTutar: 0 });
    expect(await detail(b.id)).toMatchObject({ durum: "acik", odenenTutar: 0 });
  });
  it("tahsilatı kullanılmış tutarın altına indirmeyi engeller", async () => {
    const f = await invoice();
    const r = await receipt(750);
    await match(f.id, 500);
    expect((await request(app).patch(`/api/odemeler/${r.id}`).set(auth()).send({ tutar: 499 })).status).toBe(400);
    expect((await request(app).patch(`/api/odemeler/${r.id}`).set(auth()).send({ tutar: 550 })).status).toBe(200);
    expect((await summary(f.id)).kullanilabilirTutar).toBe(50);
  });
  it("fatura silinince tahsilatı korur ve tutarı yeniden serbest bırakır", async () => {
    const a = await invoice(), b = await invoice();
    const r = await receipt(500);
    await match(a.id, 500);
    expect((await request(app).delete(`/api/faturalar/${a.id}`).set(auth())).status).toBe(204);
    expect((await summary(b.id)).kullanilabilirTutar).toBe(500);
    expect(await db.select().from(odemeler).where(eq(odemeler.id, r.id))).toHaveLength(1);
  });
  it("farklı firma, para birimi ve doğrudan fatura ödemesi kaynak sayılmaz", async () => {
    const f = await invoice(), other = await invoice();
    await receipt(500, { paraBirimi: "EUR" });
    await receipt(500, { bagliFirmaId: digerBagliId });
    await receipt(500, { faturaId: other.id });
    await db.insert(odemeler).values({ catiFirmaId: digerCatiId, bagliFirmaId: bagliId, tip: "tahsilat", tutar: "500", tarih: today, paraBirimi: "USD" });
    expect((await summary(f.id)).kullanilabilirTutar).toBe(0);
    expect((await match(f.id, 1)).status).toBe(400);
    await db.delete(odemeler).where(eq(odemeler.catiFirmaId, digerCatiId));
  });
  it("aynı tahsilat eşzamanlı iki faturada harcanamaz", async () => {
    const a = await invoice(), b = await invoice();
    await receipt(500);
    const results = await Promise.all([match(a.id, 400), match(b.id, 400)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    const rows = await db.select().from(tahsilatEslesmeleri).where(inArray(tahsilatEslesmeleri.faturaId, [a.id, b.id]));
    expect(rows.reduce((s, r) => s + Number(r.tutar), 0)).toBe(400);
  });
  it("aynı faturaya eşzamanlı fazla saydırma yapılamaz", async () => {
    const f = await invoice();
    await receipt(1000);
    const results = await Promise.all([match(f.id, 400), match(f.id, 400)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    expect(await detail(f.id)).toMatchObject({ durum: "kismi_odendi", odenenTutar: 400 });
  });
  it("taslak ve iptal faturada, geçersiz tutarda ve kimliksiz istekte işlem yapmaz", async () => {
    const a = await invoice(500, { durum: "taslak" }), b = await invoice(500, { durum: "iptal" });
    await receipt(500);
    expect((await match(a.id, 1)).status).toBe(400);
    expect((await match(b.id, 1)).status).toBe(400);
    expect((await match(a.id, -1)).status).toBe(400);
    expect((await match(a.id, 0.001)).status).toBe(400);
    expect((await request(app).post(`/api/faturalar/${a.id}/tahsilat-eslesmeleri`).send({ tutar: 1 })).status).toBe(401);
  });
});
