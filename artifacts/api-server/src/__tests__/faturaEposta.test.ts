import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, and } from "drizzle-orm";
import { db, kullanicilar, firmalar, faturalar, firmaEpostaAyarlari, gonderiGecmisi } from "@workspace/db";
import app from "../app";
import { JWT_SECRET } from "../middleware/auth";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn().mockResolvedValue({}) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

let userId = 0, catiId = 0, bagliId = 0, faturaId = 0;
let token = "";
const suffix = `eposta-${Date.now()}-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  const [u] = await db.insert(kullanicilar).values({
    ad: "E-posta Testi", email: `${suffix}@test.local`, parola: "x", rol: "yonetici", aktif: true,
  }).returning();
  userId = u.id;
  token = jwt.sign({ id: u.id, ad: u.ad, email: u.email, rol: "yonetici", sirketler: [] }, JWT_SECRET, { expiresIn: "1h" });
  const [c] = await db.insert(firmalar).values({ tip: "cati", ad: suffix, eposta: "satici@example.com" }).returning();
  catiId = c.id;
  const [b] = await db.insert(firmalar).values({
    tip: "bagli", ad: suffix, ustFirmaId: catiId, eposta: "musteri@example.com",
  }).returning();
  bagliId = b.id;
  const today = new Date().toISOString().slice(0, 10);
  const [f] = await db.insert(faturalar).values({
    catiFirmaId: catiId, bagliFirmaId: bagliId, faturaNo: suffix,
    faturaTarihi: today, vadeTarihi: today, durum: "acik",
    toplamTutar: "100", kdvTutari: "0", genelToplam: "100",
  }).returning();
  faturaId = f.id;
  await db.insert(firmaEpostaAyarlari).values({
    firmaId: catiId, smtpHost: "smtp.invalid", smtpKullanici: "test",
    smtpSifre: "synthetic-test-only", gonderenAd: "Test", gonderenAdres: "satici@example.com",
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("test-pdf", { status: 200 })));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (faturaId) await db.delete(gonderiGecmisi).where(and(eq(gonderiGecmisi.kayitId, faturaId), eq(gonderiGecmisi.kayitTipi, "fatura")));
  if (catiId) {
    await db.delete(faturalar).where(eq(faturalar.catiFirmaId, catiId));
    await db.delete(firmaEpostaAyarlari).where(eq(firmaEpostaAyarlari.firmaId, catiId));
  }
  if (bagliId) await db.delete(firmalar).where(eq(firmalar.id, bagliId));
  if (catiId) await db.delete(firmalar).where(eq(firmalar.id, catiId));
  if (userId) await db.delete(kullanicilar).where(eq(kullanicilar.id, userId));
});

describe.sequential("Fatura çoklu e-posta gönderimi", () => {
  it("otomatik doldurulacak adres bağlı firmanın adresidir", async () => {
    const r = await request(app).get(`/api/faturalar/${faturaId}`).set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.bagliFirmaEposta).toBe("musteri@example.com");
  });
  it("düzenlenmiş alıcıları ayrı SMTP alıcıları olarak yollar ve geçmişte tutar", async () => {
    const r = await request(app).post(`/api/faturalar/${faturaId}/gonder`)
      .set("Authorization", `Bearer ${token}`)
      .send({ aliciAdres: "diger@example.com, muhasebe@example.com, DIGER@example.com", aliciAd: "Müşteri" });
    expect(r.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toEqual([
      { name: "Müşteri", address: "diger@example.com" },
      { name: "Müşteri", address: "muhasebe@example.com" },
    ]);
    const [gecmis] = await db.select().from(gonderiGecmisi).where(and(
      eq(gonderiGecmisi.kayitId, faturaId), eq(gonderiGecmisi.kayitTipi, "fatura"),
    ));
    expect(gecmis.aliciEposta).toBe("diger@example.com, muhasebe@example.com");
  });
  it("listede geçersiz adres varsa hiç göndermez", async () => {
    const r = await request(app).post(`/api/faturalar/${faturaId}/gonder`)
      .set("Authorization", `Bearer ${token}`)
      .send({ aliciAdres: "diger@example.com, hatali" });
    expect(r.status).toBe(400);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
