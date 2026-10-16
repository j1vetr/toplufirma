import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, inArray } from "drizzle-orm";
import {
  db, firmalar, gemiler, odemeler, faturalar, kullanicilar, firmaSirketGorunurluk,
} from "@workspace/db";
import app from "../app";
import { JWT_SECRET } from "../middleware/auth";

const suffix = `tahsilat-gemi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let catiId = 0, digerCatiId = 0, grupId = 0, bagliId = 0, digerBagliId = 0;
let gemiId = 0, faturaId = 0, kullaniciId = 0;
let token = "";
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const [u] = await db.insert(kullanicilar).values({
    ad: "Tahsilat Test", email: `${suffix}@test.local`, parola: "x", rol: "yonetici", aktif: true,
  }).returning();
  kullaniciId = u.id;
  token = jwt.sign({ id: u.id, ad: u.ad, email: u.email, rol: u.rol, sirketler: [] }, JWT_SECRET, { expiresIn: "1h" });
  const [c, d] = await db.insert(firmalar).values([
    { tip: "cati", ad: suffix }, { tip: "cati", ad: `Diger-${suffix}` },
  ]).returning();
  catiId = c.id; digerCatiId = d.id;
  const [grup] = await db.insert(firmalar).values({ tip: "grup", ad: suffix }).returning();
  grupId = grup.id;
  await db.insert(firmaSirketGorunurluk).values({ firmaId: grupId, catiFirmaId: catiId });
  // Match firms created through the UI: ustFirmaId is intentionally NULL.
  const [b, dbagli] = await db.insert(firmalar).values([
    { tip: "bagli", ad: suffix, grupFirmaId: grupId },
    { tip: "bagli", ad: `Diger-${suffix}`, grupFirmaId: grupId },
  ]).returning();
  bagliId = b.id; digerBagliId = dbagli.id;
  const [g] = await db.insert(gemiler).values({ firmaId: bagliId, ad: suffix }).returning();
  gemiId = g.id;
  const [f] = await db.insert(faturalar).values({
    catiFirmaId: catiId, bagliFirmaId: bagliId, gemiId, faturaNo: suffix,
    faturaTarihi: today, vadeTarihi: today, durum: "acik", toplamTutar: "200", kdvTutari: "0", genelToplam: "200",
  }).returning();
  faturaId = f.id;
});

afterAll(async () => {
  if (catiId) {
    await db.delete(odemeler).where(eq(odemeler.catiFirmaId, catiId));
    await db.delete(faturalar).where(eq(faturalar.catiFirmaId, catiId));
  }
  if (digerCatiId) await db.delete(odemeler).where(eq(odemeler.catiFirmaId, digerCatiId));
  if (gemiId) await db.delete(gemiler).where(eq(gemiler.id, gemiId));
  if (bagliId || digerBagliId) await db.delete(firmalar).where(inArray(firmalar.id, [bagliId, digerBagliId]));
  if (grupId) await db.delete(firmalar).where(eq(firmalar.id, grupId));
  if (catiId || digerCatiId) await db.delete(firmalar).where(inArray(firmalar.id, [catiId, digerCatiId]));
  if (kullaniciId) await db.delete(kullanicilar).where(eq(kullanicilar.id, kullaniciId));
});

const data = () => ({
  catiFirmaId: catiId, gemiId, tip: "tahsilat", tarih: today, tutar: 25,
  paraBirimi: "USD", odemeYontemi: "nakit", aciklama: suffix,
});
const post = (body: object) => request(app).post("/api/odemeler").auth(token, { type: "bearer" }).send(body);

describe.sequential("Faturasız tahsilatta gemi ve bağlı firma", () => {
  it("grup görünürlüğüyle erişilen gemiyi seçime dahil eder", async () => {
    const resp = await request(app).get(`/api/gemiler?catiFirmaId=${catiId}`).auth(token, { type: "bearer" });
    expect(resp.status).toBe(200);
    expect(resp.body).toContainEqual(expect.objectContaining({ id: gemiId, firmaId: bagliId }));
  });
  it("yalnızca gemi gönderildiğinde bağlı firmayı türetir ve iki cariye de yansıtır", async () => {
    const resp = await post(data());
    expect(resp.status).toBe(201);
    expect(resp.body).toMatchObject({ gemiId, bagliFirmaId: bagliId, faturaId: null, tip: "tahsilat" });
    for (const path of [`/api/cariler/${bagliId}`, `/api/cariler/grup/${grupId}`]) {
      const cari = await request(app).get(path).auth(token, { type: "bearer" });
      expect(cari.status).toBe(200);
      expect(cari.body.kalemler).toContainEqual(expect.objectContaining({
        id: `o-${resp.body.id}`, tip: "tahsilat", alacak: 25,
      }));
    }
    const [f] = await db.select().from(faturalar).where(eq(faturalar.id, faturaId));
    expect(f.durum).toBe("acik");
    const [odeme] = await db.select().from(odemeler).where(eq(odemeler.id, resp.body.id));
    expect(odeme.faturaId).toBeNull();
  });
  it("gemi ve firma birlikte doğru gönderilirse tek kayıt oluşturur", async () => {
    const resp = await post({ ...data(), bagliFirmaId: bagliId });
    expect(resp.status).toBe(201);
    const list = await request(app).get(`/api/odemeler?bagliFirmaId=${bagliId}`).auth(token, { type: "bearer" });
    expect(list.body.filter((o: { id: number }) => o.id === resp.body.id)).toHaveLength(1);
    expect(list.body).toContainEqual(expect.objectContaining({ id: resp.body.id, gemiAd: suffix }));
  });
  it("farklı firmanın gemisiyle tahsilat kaydetmeyi reddeder", async () => {
    const resp = await post({ ...data(), bagliFirmaId: digerBagliId });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toContain("eşleşmiyor");
  });
  it("çatıya görünmeyen gemiyi ve geçersiz gemi kimliğini reddeder", async () => {
    expect((await post({ ...data(), catiFirmaId: digerCatiId })).status).toBe(400);
    expect((await post({ ...data(), gemiId: -1 })).status).toBe(400);
  });
  it("gemi seçmeden bağlı firmaya veya grup geneline tahsilatı korur", async () => {
    const { gemiId: _gemi, ...body } = data();
    const bagli = await post({ ...body, bagliFirmaId: bagliId });
    expect(bagli.status).toBe(201);
    expect(bagli.body).toMatchObject({ bagliFirmaId: bagliId, gemiId: null, faturaId: null });
    const grup = await post({ ...body, bagliFirmaId: grupId });
    expect(grup.status).toBe(201);
    expect(grup.body).toMatchObject({ bagliFirmaId: grupId, gemiId: null, faturaId: null });
  });
});
