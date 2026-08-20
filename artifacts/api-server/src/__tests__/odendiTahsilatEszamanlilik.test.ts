/**
 * "Ödendi" işaretlemesinin eşzamanlılık entegrasyon testleri:
 * - aynı faturayı paralel tekil/toplu isteklerle ödemek tek otomatik tahsilat üretir
 * - normal tahsilatla yarışta toplam hiçbir zaman fatura tutarını aşmaz
 * - kısmi tahsilatta yalnızca kalan tutar otomatik kaydedilir
 * - başka para birimli eski satırlar USD kalanını azaltmaz
 * - "odendi" durumuyla oluşturulan faturada tahsilat aynı transaction'da gelir
 *
 * Geliştirme veritabanına karşı çalışır (DATABASE_URL); kendi oluşturduğu
 * tüm kayıtları test sonunda siler.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, inArray } from "drizzle-orm";
import { db, kullanicilar, firmalar, faturalar, odemeler } from "@workspace/db";
import app from "../app";
import { JWT_SECRET, type TokenPayload } from "../middleware/auth";

const SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const bugun = new Date().toISOString().split("T")[0];

let token = "";
let kullaniciId = 0;
let catiId = 0;
let bagliId = 0;
let faturaSayac = 0;

/** 1 x 100 + %20 KDV = 120 USD tutarlı açık fatura oluşturur. */
async function faturaOlustur(ekstra: Record<string, unknown> = {}): Promise<number> {
  faturaSayac++;
  const resp = await request(app)
    .post("/api/faturalar")
    .set("Authorization", `Bearer ${token}`)
    .send({
      catiFirmaId: catiId,
      bagliFirmaId: bagliId,
      manuelFaturaNo: `OET-${SUFFIX}-${faturaSayac}`,
      faturaTarihi: bugun,
      vadeTarihi: bugun,
      paraBirimi: "USD",
      kalemler: [{ aciklama: "Servis", miktar: 1, birimFiyat: 100, kdvOrani: 20 }],
      ...ekstra,
    });
  expect(resp.status).toBe(201);
  return resp.body.id as number;
}

async function tahsilatEkle(faturaId: number, tutar: number, paraBirimi = "USD") {
  return request(app)
    .post("/api/odemeler")
    .set("Authorization", `Bearer ${token}`)
    .send({
      catiFirmaId: catiId,
      bagliFirmaId: bagliId,
      faturaId,
      tip: "tahsilat",
      tarih: bugun,
      tutar,
      paraBirimi,
      aciklama: "Elle kaydedilen tahsilat",
    });
}

async function faturaOdemeleri(faturaId: number) {
  return db.select().from(odemeler).where(eq(odemeler.faturaId, faturaId));
}

function usdTahsilatToplami(rows: Awaited<ReturnType<typeof faturaOdemeleri>>) {
  return rows
    .filter(o => o.tip === "tahsilat" && o.paraBirimi === "USD")
    .reduce((toplam, o) => toplam + Number(o.tutar), 0);
}

beforeAll(async () => {
  const email = `odendi-eszamanlilik-${SUFFIX}@test.local`;
  const [u] = await db.insert(kullanicilar)
    .values({ ad: "Eşzamanlılık Test", email, parola: "x", rol: "yonetici", aktif: true })
    .returning({ id: kullanicilar.id });
  kullaniciId = u.id;
  token = jwt.sign({
    id: u.id, email, ad: "Eşzamanlılık Test", rol: "yonetici", sirketler: [], modulIzinleri: null,
  } satisfies TokenPayload, JWT_SECRET, { expiresIn: "1h" });

  const [cati] = await db.insert(firmalar)
    .values({ tip: "cati", ad: `Eşzamanlılık Test Çatı ${SUFFIX}`, seriOneki: "OET" })
    .returning({ id: firmalar.id });
  catiId = cati.id;
  const [bagli] = await db.insert(firmalar)
    .values({ tip: "bagli", ad: `Eşzamanlılık Test Bağlı ${SUFFIX}`, ustFirmaId: catiId })
    .returning({ id: firmalar.id });
  bagliId = bagli.id;
});

afterAll(async () => {
  await db.delete(odemeler).where(eq(odemeler.catiFirmaId, catiId));
  await db.delete(faturalar).where(eq(faturalar.catiFirmaId, catiId));
  await db.delete(firmalar).where(inArray(firmalar.id, [bagliId, catiId]));
  await db.delete(kullanicilar).where(eq(kullanicilar.id, kullaniciId));
});

describe("Ödendi işaretlemesi eşzamanlılığı", () => {
  it("aynı faturaya paralel tekil PATCH çağrıları tek otomatik tahsilat üretir", async () => {
    const faturaId = await faturaOlustur();

    const sonuclar = await Promise.all([
      request(app).patch(`/api/faturalar/${faturaId}`).set("Authorization", `Bearer ${token}`).send({ durum: "odendi" }),
      request(app).patch(`/api/faturalar/${faturaId}`).set("Authorization", `Bearer ${token}`).send({ durum: "odendi" }),
    ]);
    expect(sonuclar.map(r => r.status)).toEqual([200, 200]);

    const ods = await faturaOdemeleri(faturaId);
    expect(ods.filter(o => o.otomatik)).toHaveLength(1);
    expect(usdTahsilatToplami(ods)).toBe(120);
  });

  it("tekil PATCH ile paralel toplu-durum çağrısı tek otomatik tahsilat üretir", async () => {
    const faturaId = await faturaOlustur();

    const [tekil, toplu] = await Promise.all([
      request(app).patch(`/api/faturalar/${faturaId}`).set("Authorization", `Bearer ${token}`).send({ durum: "odendi" }),
      request(app).patch("/api/faturalar/toplu-durum").set("Authorization", `Bearer ${token}`).send({ ids: [faturaId], durum: "odendi" }),
    ]);
    expect(tekil.status).toBe(200);
    expect(toplu.status).toBe(200);

    const ods = await faturaOdemeleri(faturaId);
    expect(ods.filter(o => o.otomatik)).toHaveLength(1);
    expect(usdTahsilatToplami(ods)).toBe(120);
  });

  it("normal tam tahsilatla yarışta fatura tutarının üzerinde tahsilat oluşmaz", async () => {
    const faturaId = await faturaOlustur();

    const [isaretle, normalTahsilat] = await Promise.all([
      request(app).patch(`/api/faturalar/${faturaId}`).set("Authorization", `Bearer ${token}`).send({ durum: "odendi" }),
      tahsilatEkle(faturaId, 120),
    ]);
    expect(isaretle.status).toBe(200);
    expect([201, 400]).toContain(normalTahsilat.status);

    const ods = await faturaOdemeleri(faturaId);
    expect(usdTahsilatToplami(ods)).toBe(120);
    expect(ods.filter(o => o.otomatik)).toHaveLength(normalTahsilat.status === 201 ? 0 : 1);
  });

  it("kısmi tahsilat sonrası ödendi işaretlemesi yalnız kalan tutarı ekler", async () => {
    const faturaId = await faturaOlustur();
    const kismi = await tahsilatEkle(faturaId, 35);
    expect(kismi.status).toBe(201);

    const isaretle = await request(app)
      .patch(`/api/faturalar/${faturaId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ durum: "odendi" });
    expect(isaretle.status).toBe(200);

    const ods = await faturaOdemeleri(faturaId);
    const [otomatik] = ods.filter(o => o.otomatik);
    expect(Number(otomatik.tutar)).toBe(85);
    expect(usdTahsilatToplami(ods)).toBe(120);
  });

  it("farklı para birimli eski tahsilat USD kalanını azaltmaz", async () => {
    const faturaId = await faturaOlustur();
    // Eski/veri migrasyonu kaynaklı uyumsuz kayıt: mevcut API yeni satırı reddeder,
    // ama tahsilat tamamlama hesabı bu satırı USD tutarına katmamalıdır.
    await db.insert(odemeler).values({
      catiFirmaId: catiId, bagliFirmaId: bagliId, faturaId,
      tip: "tahsilat", tarih: bugun, tutar: "999", paraBirimi: "EUR",
      odemeYontemi: "banka_havalesi", aciklama: "Eski EUR tahsilatı",
    });

    const isaretle = await request(app)
      .patch(`/api/faturalar/${faturaId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ durum: "odendi" });
    expect(isaretle.status).toBe(200);

    const ods = await faturaOdemeleri(faturaId);
    const [otomatik] = ods.filter(o => o.otomatik);
    expect(otomatik.paraBirimi).toBe("USD");
    expect(Number(otomatik.tutar)).toBe(120);
    expect(usdTahsilatToplami(ods)).toBe(120);
  });

  it("durumOverride=odendi ile oluşturulan faturada otomatik tahsilat gelir", async () => {
    const faturaId = await faturaOlustur({ durumOverride: "odendi" });

    const [fatura] = await db.select().from(faturalar).where(eq(faturalar.id, faturaId));
    const ods = await faturaOdemeleri(faturaId);
    expect(fatura.durum).toBe("odendi");
    expect(ods.filter(o => o.otomatik)).toHaveLength(1);
    expect(usdTahsilatToplami(ods)).toBe(120);
  });
});