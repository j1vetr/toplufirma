import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, inArray } from "drizzle-orm";
import { db, kullanicilar, firmalar, faturalar, odemeler, faturaKalemleri } from "@workspace/db";
import app from "../app";
import { JWT_SECRET } from "../middleware/auth";

const suffix = `silme-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userId = 0, catiId = 0, grupId = 0, bagliId = 0, faturaId = 0;
let manuelId = 0, otomatikId = 0;
let token = "";
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const [u] = await db.insert(kullanicilar).values({
    ad: "Silme Testi", email: `${suffix}@test.local`, parola: "x", rol: "yonetici", aktif: true,
  }).returning();
  userId = u.id;
  token = jwt.sign({ id: userId, ad: u.ad, email: u.email, rol: "yonetici", sirketler: [] }, JWT_SECRET, { expiresIn: "1h" });
  const [c] = await db.insert(firmalar).values({ tip: "cati", ad: suffix }).returning();
  catiId = c.id;
  const [g] = await db.insert(firmalar).values({ tip: "grup", ad: suffix }).returning();
  grupId = g.id;
  const [b] = await db.insert(firmalar).values({ tip: "bagli", ad: suffix, grupFirmaId: grupId }).returning();
  bagliId = b.id;
  const [f] = await db.insert(faturalar).values({
    catiFirmaId: catiId, bagliFirmaId: bagliId, faturaNo: suffix,
    faturaTarihi: today, vadeTarihi: today, durum: "odendi", toplamTutar: "100", kdvTutari: "0", genelToplam: "100",
  }).returning();
  faturaId = f.id;
  await db.insert(faturaKalemleri).values({
    faturaId, aciklama: "Test", miktar: "1", birimFiyat: "100", kdvOrani: "0",
    araToplam: "100", kdvTutari: "0", genelToplam: "100",
  });
  const rows = await db.insert(odemeler).values([
    { catiFirmaId: catiId, bagliFirmaId: bagliId, faturaId, tip: "tahsilat", tarih: today, tutar: "20", otomatik: false },
    { catiFirmaId: catiId, bagliFirmaId: bagliId, faturaId, tip: "tahsilat", tarih: today, tutar: "80", otomatik: true },
  ]).returning();
  manuelId = rows[0].id;
  otomatikId = rows[1].id;
});

afterAll(async () => {
  if (catiId) {
    await db.delete(odemeler).where(eq(odemeler.catiFirmaId, catiId));
    await db.delete(faturalar).where(eq(faturalar.catiFirmaId, catiId));
  }
  if (bagliId) await db.delete(firmalar).where(eq(firmalar.id, bagliId));
  if (grupId) await db.delete(firmalar).where(eq(firmalar.id, grupId));
  if (catiId) await db.delete(firmalar).where(eq(firmalar.id, catiId));
  if (userId) await db.delete(kullanicilar).where(eq(kullanicilar.id, userId));
});

describe.sequential("Fatura ve firma silme", () => {
  it("kimliksiz silmeyi reddeder", async () => {
    expect((await request(app).delete(`/api/faturalar/${faturaId}`)).status).toBe(401);
  });
  it("firma silme incelemesini yalnızca yöneticiye açar", async () => {
    const url = `/api/firmalar/${bagliId}/silme-baglantilari`;
    expect((await request(app).get(url)).status).toBe(401);
    const [u] = await db.insert(kullanicilar).values({
      ad: "Kısıtlı Test", email: `kisitli-${suffix}@test.local`, parola: "x", rol: "muhasebeci", aktif: true,
    }).returning();
    try {
      const t = jwt.sign({ id: u.id, ad: u.ad, email: u.email, rol: u.rol, sirketler: [] }, JWT_SECRET, { expiresIn: "1h" });
      expect((await request(app).get(url).auth(t, { type: "bearer" })).status).toBe(403);
    } finally {
      await db.delete(kullanicilar).where(eq(kullanicilar.id, u.id));
    }
  });
  it("grupta bağlı firmanın adını ve kimliğini, firmada fatura ve ödemeleri listeler", async () => {
    const grup = await request(app).get(`/api/firmalar/${grupId}/silme-baglantilari`).auth(token, { type: "bearer" });
    expect(grup.status).toBe(200);
    expect(grup.body.baglantilar).toContainEqual(expect.objectContaining({
      id: bagliId, tur: "Bağlı firma", ad: suffix, href: `/cariler/${bagliId}`,
    }));
    const bagli = await request(app).get(`/api/firmalar/${bagliId}/silme-baglantilari`).auth(token, { type: "bearer" });
    expect(bagli.status).toBe(200);
    expect(bagli.body.baglantilar).toHaveLength(3);
    expect(bagli.body.baglantilar).toContainEqual(expect.objectContaining({
      id: faturaId, tur: "Fatura", ad: suffix, href: `/faturalar/${faturaId}`,
    }));
    expect(bagli.body.baglantilar).toContainEqual(expect.objectContaining({ id: manuelId, tur: "Tahsilat" }));
  });
  it("pasif firmaları ve taslak faturaları gizlemez", async () => {
    await db.update(firmalar).set({ aktif: false }).where(eq(firmalar.id, bagliId));
    await db.update(faturalar).set({ durum: "taslak" }).where(eq(faturalar.id, faturaId));
    try {
      const grup = await request(app).get(`/api/firmalar/${grupId}/silme-baglantilari`).auth(token, { type: "bearer" });
      expect(grup.body.baglantilar).toContainEqual(expect.objectContaining({ id: bagliId, detay: "bagli (pasif)" }));
      const bagli = await request(app).get(`/api/firmalar/${bagliId}/silme-baglantilari`).auth(token, { type: "bearer" });
      expect(bagli.body.baglantilar).toContainEqual(expect.objectContaining({
        id: faturaId, detay: expect.stringContaining("taslak"),
      }));
    } finally {
      await db.update(firmalar).set({ aktif: true }).where(eq(firmalar.id, bagliId));
      await db.update(faturalar).set({ durum: "odendi" }).where(eq(faturalar.id, faturaId));
    }
  });
  it("alt kayıtları olan firma ve grubu açıklayıcı hata ile korur", async () => {
    const grup = await request(app).delete(`/api/firmalar/${grupId}`).auth(token, { type: "bearer" });
    expect(grup.status).toBe(409);
    const bagli = await request(app).delete(`/api/firmalar/${bagliId}`).auth(token, { type: "bearer" });
    expect(bagli.status).toBe(409);
    expect(bagli.body.error).toContain("bağlı");
  });
  it("ödenmiş faturayı siler, otomatik tahsilatı kaldırır, manuel tahsilatı korur", async () => {
    const resp = await request(app).delete(`/api/faturalar/${faturaId}`).auth(token, { type: "bearer" });
    expect(resp.status).toBe(204);
    expect(await db.select().from(faturalar).where(eq(faturalar.id, faturaId))).toHaveLength(0);
    expect(await db.select().from(faturaKalemleri).where(eq(faturaKalemleri.faturaId, faturaId))).toHaveLength(0);
    const rows = await db.select().from(odemeler).where(inArray(odemeler.id, [manuelId, otomatikId]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: manuelId, faturaId: null, tutar: "20.00", otomatik: false });
  });
  it("fatura silindikten sonra kalan manuel tahsilatı tutarıyla gösterir", async () => {
    const preview = await request(app).get(`/api/firmalar/${bagliId}/silme-baglantilari`).auth(token, { type: "bearer" });
    expect(preview.status).toBe(200);
    expect(preview.body.baglantilar).toHaveLength(1);
    expect(preview.body.baglantilar[0]).toMatchObject({
      id: manuelId, tur: "Tahsilat", detay: expect.stringContaining("20.00 USD · Faturaya bağlı değil"),
    });
    const sil = await request(app).delete(`/api/firmalar/${bagliId}`).auth(token, { type: "bearer" });
    expect(sil.status).toBe(409);
    expect(sil.body.error).toContain("Tahsilat");
  });
  it("manuel tahsilat temizlendikten sonra bağlı firmayı ve grubu sırayla siler", async () => {
    await db.delete(odemeler).where(eq(odemeler.id, manuelId));
    const preview = await request(app).get(`/api/firmalar/${bagliId}/silme-baglantilari`).auth(token, { type: "bearer" });
    expect(preview.body.baglantilar).toEqual([]);
    const bagli = await request(app).delete(`/api/firmalar/${bagliId}`).auth(token, { type: "bearer" });
    expect(bagli.status).toBe(204);
    const grup = await request(app).delete(`/api/firmalar/${grupId}`).auth(token, { type: "bearer" });
    expect(grup.status).toBe(204);
    const missing = await request(app).get(`/api/firmalar/${grupId}/silme-baglantilari`).auth(token, { type: "bearer" });
    expect(missing.status).toBe(404);
  });
});
